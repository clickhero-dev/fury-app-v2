/**
 * Testes unitários para criação de campanha no Meta
 *
 * Cobre createCampaign (campanha simples) e createCampaignFromWizard (wizard completo).
 * Todos os mocks no nível de serviço — sem dependência de DB ou HTTP real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mocks hoisted (vitest hoists vi.mock, então variáveis precisam de vi.hoisted) ──
const {
  dbMock,
  mockDecryptMetaToken,
  mockMetaApiCall,
  mockUploadAdImage,
  mockSearchMetaCityLocations,
} = vi.hoisted(() => ({
  dbMock: {
    query: {
      metaConnections: { findFirst: vi.fn() },
      creativeAssets: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
  } as any,
  mockDecryptMetaToken: vi.fn(),
  mockMetaApiCall: vi.fn(),
  mockUploadAdImage: vi.fn(),
  mockSearchMetaCityLocations: vi.fn(),
}));

vi.mock('@fury/db', () => ({
  db: dbMock,
  campaigns: {},
  metaConnections: {},
  creativeAssets: {},
  automationRules: {},
  furyInsights: {},
  tenants: {},
  users: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn(() => ({ type: 'desc' })),
  isNull: vi.fn(() => ({ type: 'isNull' })),
}));

vi.mock('../utils/crypto.js', () => ({
  decryptMetaToken: mockDecryptMetaToken,
}));

vi.mock('../lib/meta-api.js', () => ({
  metaApiCall: mockMetaApiCall,
  uploadAdImage: mockUploadAdImage,
  searchMetaCityLocations: mockSearchMetaCityLocations,
}));

vi.mock('../middleware/errorHandler.js', () => {
  class AppError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  return { AppError };
});

vi.mock('../lib/campaigns-cache.js', () => ({
  invalidateCampaignsCache: vi.fn(),
}));

vi.mock('../lib/locations-cache.js', () => ({
  getMetaLocationsCache: vi.fn().mockResolvedValue(null),
  setMetaLocationsCache: vi.fn(),
}));

vi.mock('../services/meta.service.js', () => ({
  getResolvedTenantAssetSelection: vi.fn().mockResolvedValue({ pages: [] }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────
import { createCampaign, createCampaignFromWizard } from '../services/campaigns.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────
function makeMetaConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-001',
    tenantId: 'tenant-test',
    metaUserId: 'mu_123',
    accessToken: 'enc:tok:fmt',
    adAccounts: [{ id: 'act_111222333', name: 'Teste', account_status: 1, currency: 'BRL' }],
    selectedAdAccountId: 'act_111222333',
    selectedPageIds: ['999888777666555'],
    ...overrides,
  };
}

function resetMocks() {
  vi.clearAllMocks();
  mockDecryptMetaToken.mockReturnValue('EAACreal_token');
  mockMetaApiCall.mockResolvedValue({ id: 'meta_c_123' });
  mockSearchMetaCityLocations.mockResolvedValue([{ key: '12345', name: 'São Paulo' }]);
  mockUploadAdImage.mockResolvedValue('hash123');
  dbMock.query.metaConnections.findFirst.mockResolvedValue(null);
  dbMock.query.creativeAssets.findFirst.mockResolvedValue(null);
  dbMock.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        { id: 'uuid1', metaCampaignId: 'meta_c_123', name: 'test', status: 'paused' },
      ]),
    }),
  });
}

// ─── createCampaign ──────────────────────────────────────────────────────

describe('createCampaign', () => {
  beforeEach(resetMocks);

  const args = {
    tenantId: 'tenant-test',
    name: 'Campanha Teste',
    objective: 'OUTCOME_SALES' as const,
    dailyBudget: 1000,
    adAccountId: 'act_111222333',
  };

  it('cria campanha com sucesso', async () => {
    dbMock.query.metaConnections.findFirst.mockResolvedValue(makeMetaConnection());
    const result = await createCampaign(args);
    expect(mockDecryptMetaToken).toHaveBeenCalled();
    expect(mockMetaApiCall).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('metaCampaignId', 'meta_c_123');
  });

  it('META_CONNECTION_NOT_FOUND (403)', async () => {
    await expect(createCampaign(args)).rejects.toMatchObject({
      statusCode: 403, code: 'META_CONNECTION_NOT_FOUND',
    });
  });

  it('AD_ACCOUNT_NOT_FOUND (403)', async () => {
    dbMock.query.metaConnections.findFirst.mockResolvedValue(
      makeMetaConnection({ adAccounts: [{ id: 'act_X', name: 'X', account_status: 1, currency: 'BRL' }] })
    );
    await expect(createCampaign(args)).rejects.toMatchObject({
      statusCode: 403, code: 'AD_ACCOUNT_NOT_FOUND',
    });
  });

  it('TOKEN_DECRYPT_ERROR (500)', async () => {
    dbMock.query.metaConnections.findFirst.mockResolvedValue(makeMetaConnection());
    mockDecryptMetaToken.mockImplementation(() => {
      throw Object.assign(new Error('fail'), { statusCode: 500, code: 'TOKEN_DECRYPT_ERROR' });
    });
    await expect(createCampaign(args)).rejects.toMatchObject({ code: 'TOKEN_DECRYPT_ERROR' });
  });

  it('META_TOKEN_EXPIRED (401)', async () => {
    dbMock.query.metaConnections.findFirst.mockResolvedValue(makeMetaConnection());
    mockMetaApiCall.mockRejectedValue(Object.assign(new Error('exp'), { metaCode: 190 }));
    await expect(createCampaign(args)).rejects.toMatchObject({
      statusCode: 401, code: 'META_TOKEN_EXPIRED',
    });
  });

  it('INVALID_PARAMETER (400)', async () => {
    dbMock.query.metaConnections.findFirst.mockResolvedValue(makeMetaConnection());
    mockMetaApiCall.mockRejectedValue(Object.assign(new Error('bad'), { metaCode: 100 }));
    await expect(createCampaign(args)).rejects.toMatchObject({
      statusCode: 400, code: 'INVALID_PARAMETER',
    });
  });
});

// ─── createCampaignFromWizard ────────────────────────────────────────────

describe('createCampaignFromWizard', () => {
  beforeEach(() => {
    resetMocks();
    dbMock.query.metaConnections.findFirst.mockResolvedValue(makeMetaConnection());
    mockMetaApiCall
      .mockResolvedValueOnce({ id: 'c_w1' })
      .mockResolvedValueOnce({ id: 'as_w1' })
      .mockResolvedValueOnce({ id: 'cr_w1' })
      .mockResolvedValueOnce({ id: 'ad_w1' });
  });

  const w = {
    tenantId: 'tenant-test',
    objective: 'visits' as const,
    creativeAssetId: undefined as string | undefined,
    creativeUploadUrl: 'https://img.example/ad.jpg',
    creativeInstagramMediaId: undefined as string | undefined,
    creativeMediaUrl: undefined as string | undefined,
    headline: 'Oferta!',
    primaryText: 'Aproveite.',
    destinationUrl: 'https://clickhero.com.br',
    locationCity: 'São Paulo',
    locationCityKey: undefined as string | undefined,
    locationRadiusKm: 25,
    ageMin: 18,
    ageMax: 65,
    gender: 'all' as const,
    dailyBudgetBrl: 15,
    durationDays: 7,
    whatsappPageId: undefined as string | undefined,
    whatsappPageName: undefined as string | undefined,
    whatsappPhoneNumberId: undefined as string | undefined,
    whatsappPhoneNumber: undefined as string | undefined,
    destinations: [] as any[],
    instagramUserId: undefined as string | undefined,
    instagramUsername: undefined as string | undefined,
  };

  it('cria campanha wizard completa (4 chamadas Meta)', async () => {
    const result = await createCampaignFromWizard(w);
    expect(result).toHaveProperty('success', true);
    expect(mockMetaApiCall).toHaveBeenCalledTimes(4);
  });

  it('AD_ACCOUNT_NOT_SELECTED', async () => {
    dbMock.query.metaConnections.findFirst.mockResolvedValue(
      makeMetaConnection({ selectedAdAccountId: null })
    );
    await expect(createCampaignFromWizard(w)).rejects.toMatchObject({
      statusCode: 400, code: 'AD_ACCOUNT_NOT_SELECTED',
    });
  });

  it('CREATIVE_IMAGE_MISSING', async () => {
    await expect(
      createCampaignFromWizard({ ...w, creativeUploadUrl: undefined })
    ).rejects.toMatchObject({
      statusCode: 400, code: 'CREATIVE_IMAGE_MISSING',
    });
  });

  it('PAGE_NOT_FOUND', async () => {
    dbMock.query.metaConnections.findFirst.mockResolvedValue(
      makeMetaConnection({ selectedPageIds: [] })
    );
    await expect(createCampaignFromWizard(w)).rejects.toMatchObject({
      statusCode: 400, code: 'PAGE_NOT_FOUND',
    });
  });

  it('META_TOKEN_EXPIRED na etapa campaign', async () => {
    mockMetaApiCall.mockReset();
    mockMetaApiCall.mockRejectedValue(Object.assign(new Error('exp'), { metaCode: 190 }));
    await expect(createCampaignFromWizard(w)).rejects.toMatchObject({
      statusCode: 401, code: 'META_TOKEN_EXPIRED',
    });
  });

  it('META_PERMISSION_DENIED (OAuthException)', async () => {
    mockMetaApiCall.mockReset();
    mockMetaApiCall.mockRejectedValue(
      Object.assign(new Error('perm'), { metaCode: 200, metaType: 'OAuthException' })
    );
    await expect(createCampaignFromWizard(w)).rejects.toMatchObject({
      statusCode: 403, code: 'META_PERMISSION_DENIED',
    });
  });

  it('META_CONNECTION_NOT_FOUND no wizard', async () => {
    dbMock.query.metaConnections.findFirst.mockResolvedValue(null);
    await expect(createCampaignFromWizard(w)).rejects.toMatchObject({
      statusCode: 403, code: 'META_CONNECTION_NOT_FOUND',
    });
  });

  it('WHATSAPP_PAGE_REQUIRED', async () => {
    await expect(
      createCampaignFromWizard({
        ...w,
        objective: 'whatsapp' as const,
        whatsappPageId: undefined,
        whatsappPhoneNumber: undefined,
        destinations: [] as any[],
      })
    ).rejects.toMatchObject({
      statusCode: 400, code: 'WHATSAPP_PAGE_REQUIRED',
    });
  });

  it('WHATSAPP_NUMBER_REQUIRED', async () => {
    await expect(
      createCampaignFromWizard({
        ...w,
        objective: 'whatsapp' as const,
        whatsappPageId: '111222333444555',
        whatsappPhoneNumber: undefined,
        destinations: ['whatsapp'] as any[],
      })
    ).rejects.toMatchObject({
      statusCode: 400, code: 'WHATSAPP_NUMBER_REQUIRED',
    });
  });
});
