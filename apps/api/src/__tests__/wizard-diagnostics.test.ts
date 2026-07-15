/**
 * Testes de diagnóstico para createCampaignFromWizard
 * Simula dados de produção e testa todos os cenários de erro da Meta API.
 * 
 * Uso: npx vitest run src/__tests__/wizard-diagnostics.test.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const PROD_TENANT_ID = '93c8e8e9-7c8d-4e17-a5be-ee48b916bb41';
const PROD_AD_ACCOUNT_ID = 'act_2141634409570732';

// ─── Mocks hoisted ──────────────────────────────────────────────────────────
const {
  dbMock,
  mockDecryptMetaToken,
  mockMetaApiCall,
  mockUploadAdImage,
  mockSearchMetaCityLocations,
  mockInvalidateCache,
} = vi.hoisted(() => ({
  dbMock: {
    query: {
      metaConnections: { findFirst: vi.fn() },
      creativeAssets: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(() => [{ id: 'db-camp-001' }]) })),
    })),
  } as any,
  mockDecryptMetaToken: vi.fn(),
  mockMetaApiCall: vi.fn(),
  mockUploadAdImage: vi.fn(),
  mockSearchMetaCityLocations: vi.fn(),
  mockInvalidateCache: vi.fn(),
}));

vi.mock('@fury/db', () => ({
  db: dbMock,
  campaigns: {}, metaConnections: {}, creativeAssets: {},
  automationRules: {}, furyInsights: {}, tenants: {}, users: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn(() => ({ type: 'desc' })),
  isNull: vi.fn(() => ({ type: 'isNull' })),
}));

vi.mock('../utils/crypto.js', () => ({ decryptMetaToken: mockDecryptMetaToken }));
vi.mock('../lib/meta-api.js', () => ({
  metaApiCall: mockMetaApiCall,
  uploadAdImage: mockUploadAdImage,
  searchMetaCityLocations: mockSearchMetaCityLocations,
}));

vi.mock('../middleware/errorHandler.js', () => {
  class AppError extends Error {
    statusCode: number; code: string; details?: Record<string, unknown>;
    constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
      super(message); this.statusCode = statusCode; this.code = code; this.details = details;
    }
  }
  return { AppError };
});

vi.mock('../lib/campaigns-cache.js', () => ({ invalidateCampaignsCache: mockInvalidateCache }));
vi.mock('../lib/locations-cache.js', () => ({
  getMetaLocationsCache: vi.fn().mockResolvedValue(null),
  setMetaLocationsCache: vi.fn(),
}));
vi.mock('../services/meta.service.js', () => ({
  getResolvedTenantAssetSelection: vi.fn().mockResolvedValue({ pages: [] }),
}));

import { createCampaignFromWizard } from '../services/campaigns.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function prodConnection() {
  return {
    id: 'conn-prod', tenantId: PROD_TENANT_ID, metaUserId: 'mu_123',
    accessToken: 'iv:tag:enc', tokenExpiresAt: new Date('2027-01-01'),
    adAccounts: [{ id: PROD_AD_ACCOUNT_ID }],
    selectedAdAccountId: PROD_AD_ACCOUNT_ID,
    selectedBusinessIds: ['biz_1'], selectedPageIds: ['page_999888777'],
    selectedAdAccountIds: [PROD_AD_ACCOUNT_ID],
    selectedWhatsappNumberIds: [], createdAt: new Date(), updatedAt: new Date(),
  };
}

const wizardPayload = {
  tenantId: PROD_TENANT_ID,
  objective: 'visits' as const,
  creativeUploadUrl: 'https://placehold.co/600x600?text=Ad',
  headline: 'Promoção!', primaryText: 'Aproveite.',
  destinationUrl: 'https://clickhero.com.br',
  locationCity: 'São Paulo', locationRadiusKm: 15,
  ageMin: 18, ageMax: 55, gender: 'all' as const,
  dailyBudgetBrl: 30, durationDays: 14,
};

function setupBasics() {
  dbMock.query.metaConnections.findFirst.mockResolvedValue(prodConnection());
  mockDecryptMetaToken.mockReturnValue('EAAC...real_token');
  mockSearchMetaCityLocations.mockResolvedValue([
    { key: '2421217', name: 'SP', region: 'SP', country_code: 'BR', type: 'city' },
  ]);
}

// ─── TESTES ──────────────────────────────────────────────────────────────────
describe('Wizard Diagnostics (dados de produção)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('DIAG 1: Fluxo feliz completo', async () => {
    setupBasics();
    mockMetaApiCall
      .mockResolvedValueOnce({ id: 'c_ok' })
      .mockResolvedValueOnce({ id: 'as_ok' })
      .mockResolvedValueOnce({ id: 'cr_ok' })
      .mockResolvedValueOnce({ id: 'ad_ok' });

    const result = await createCampaignFromWizard(wizardPayload);
    expect(result.success).toBe(true);
    expect(result.meta_campaign_id).toBe('c_ok');
    expect(mockMetaApiCall).toHaveBeenCalledTimes(4); // campaign + adset + creative + ad
  });

  it('DIAG 2: Erro na criação da campaign (sem código Meta)', async () => {
    setupBasics();
    mockMetaApiCall.mockRejectedValue(new Error('Connection refused'));

    await expect(createCampaignFromWizard(wizardPayload)).rejects.toMatchObject({
      statusCode: 400, code: 'META_API_ERROR',
    });
  });

  it('DIAG 3: Meta retorna INVALID_PARAMETER (code=100)', async () => {
    setupBasics();
    mockMetaApiCall.mockRejectedValue(
      Object.assign(new Error('[Meta API] 100: Invalid parameter'), {
        metaCode: 100, httpStatus: 400,
        metaUserMsg: 'Campo X é obrigatório', metaBlameField: 'targeting',
      })
    );

    try {
      await createCampaignFromWizard(wizardPayload);
      expect(true).toBe(false); // não deve chegar aqui
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('META_API_ERROR');
      expect(err.message).toContain('Campo X');
      expect(err.details?.step).toBe('campaign');
      expect(err.details?.blame_field).toBe('targeting');
    }
  });

  it('DIAG 4: Meta retorna erro de permissão (code=200)', async () => {
    setupBasics();
    mockMetaApiCall.mockRejectedValue(
      Object.assign(new Error('perm denied'), {
        metaCode: 200, metaType: 'OAuthException', httpStatus: 403,
      })
    );

    await expect(createCampaignFromWizard(wizardPayload)).rejects.toMatchObject({
      statusCode: 403, code: 'META_PERMISSION_DENIED',
    });
  });

  it('DIAG 5: Falha no adset (depois da campaign criada)', async () => {
    setupBasics();
    mockMetaApiCall
      .mockResolvedValueOnce({ id: 'c_ok' })  // campaign OK
      .mockRejectedValueOnce(new Error('AdSet fail'));  // adset FAIL

    await expect(createCampaignFromWizard(wizardPayload)).rejects.toMatchObject({
      statusCode: 400, code: 'META_API_ERROR',
    });
  });

  it('DIAG 6: Falha no creative (depois de campaign + adset)', async () => {
    setupBasics();
    mockMetaApiCall
      .mockResolvedValueOnce({ id: 'c_ok' })
      .mockResolvedValueOnce({ id: 'as_ok' })
      .mockRejectedValueOnce(new Error('Creative fail'));  // creative FAIL

    await expect(createCampaignFromWizard(wizardPayload)).rejects.toMatchObject({
      statusCode: 400, code: 'META_API_ERROR',
    });
  });

  it('DIAG 7: Falha na busca de cidade', async () => {
    dbMock.query.metaConnections.findFirst.mockResolvedValue(prodConnection());
    mockDecryptMetaToken.mockReturnValue('EAAC...real_token');
    mockSearchMetaCityLocations.mockRejectedValue(
      Object.assign(new Error('location error'), { metaCode: 100, httpStatus: 400 })
    );

    await expect(createCampaignFromWizard(wizardPayload)).rejects.toMatchObject({
      statusCode: 400, code: 'META_API_ERROR',
    });
  });

  it('DIAG 8: Token expirado (metaCode=190) no meio do fluxo', async () => {
    setupBasics();
    mockMetaApiCall
      .mockResolvedValueOnce({ id: 'c_ok' })
      .mockRejectedValueOnce(Object.assign(new Error('expired'), {
        metaCode: 190, httpStatus: 400,
      }));

    await expect(createCampaignFromWizard(wizardPayload)).rejects.toMatchObject({
      statusCode: 401, code: 'META_TOKEN_EXPIRED',
    });
  });

  it('DIAG 9: AD_ACCOUNT_NOT_SELECTED', async () => {
    const conn = prodConnection();
    conn.selectedAdAccountId = null;
    conn.adAccounts = []; // sem contas, fallback não se aplica
    dbMock.query.metaConnections.findFirst.mockResolvedValue(conn);
    mockDecryptMetaToken.mockReturnValue('EAAC...');

    await expect(createCampaignFromWizard(wizardPayload)).rejects.toMatchObject({
      statusCode: 400, code: 'AD_ACCOUNT_NOT_SELECTED',
    });
  });

  it('DIAG 10: CREATIVE_IMAGE_MISSING', async () => {
    const noImage = { ...wizardPayload, creativeUploadUrl: undefined };
    dbMock.query.metaConnections.findFirst.mockResolvedValue(prodConnection());
    mockDecryptMetaToken.mockReturnValue('EAAC...');

    await expect(createCampaignFromWizard(noImage)).rejects.toMatchObject({
      statusCode: 400, code: 'CREATIVE_IMAGE_MISSING',
    });
  });

  it('DIAG 11: Erro com blame_field_specs (formato especial)', async () => {
    setupBasics();
    mockMetaApiCall.mockRejectedValue(
      Object.assign(new Error('[Meta API] 100: Invalid parameter'), {
        metaCode: 100, httpStatus: 400,
        metaUserMsg: 'Parâmetro inválido',
        metaBlameField: undefined,
      })
    );

    try {
      await createCampaignFromWizard(wizardPayload);
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('META_API_ERROR');
      expect(err.details?.meta_code).toBe(100);
    }
  });
});
