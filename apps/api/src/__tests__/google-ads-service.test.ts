/**
 * Testes do serviço Google Ads (Fluxo 3 — F3.4/F3.5).
 *
 * Cobre:
 *  - criarCampanhaAds: cria asset set LOCATION_SYNC → attach customer →
 *    budget (mensal/30.4) → campanha SEARCH; persiste ids/status no perfil
 *  - idempotência: tenant com campanha já criada não duplica
 *  - validações: verba fora do intervalo, perfil não verificado, sem conta Ads
 *  - pauseCampanhaAds: atualiza status local
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptToken } from '../utils/crypto.js';

const {
  dbMock,
  mockCreateGoogleAdsApiClient,
  mockMutateAssetSets,
  mockMutateCustomerAssetSets,
  mockMutateCampaign,
  mockSearchStream,
} = vi.hoisted(() => ({
  dbMock: {
    query: {
      googleConnections: { findFirst: vi.fn() },
      googleBusinessProfiles: { findFirst: vi.fn() },
      businessProfileSettings: { findFirst: vi.fn() },
      tenants: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as any,
  mockCreateGoogleAdsApiClient: vi.fn(),
  mockMutateAssetSets: vi.fn(),
  mockMutateCustomerAssetSets: vi.fn(),
  mockMutateCampaign: vi.fn(),
  mockSearchStream: vi.fn(),
}));

vi.mock('@fury/db', () => ({
  db: dbMock,
  googleConnections: {},
  googleBusinessProfiles: {},
  businessProfileSettings: {},
  googleSyncLogs: {},
  tenants: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('../lib/google-ads-api.js', () => ({
  createGoogleAdsApiClient: mockCreateGoogleAdsApiClient,
  monthlyBudgetToDailyMicros: (brl: number) => Math.round((brl / 30.4) * 1_000_000),
}));

import { googleService } from '../services/google/google.service.js';
import { AppError } from '../middleware/errorHandler.js';

function makeConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    tenantId: 'tenant-A',
    googleUserId: 'google-user-123',
    accessToken: encryptToken('ya29.fake'),
    refreshToken: encryptToken('1//fake'),
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    accountId: 'accounts/123456',
    accountName: 'Minha Empresa',
    scopes: [
      'https://www.googleapis.com/auth/business.manage',
      'https://www.googleapis.com/auth/adwords',
    ],
    ...overrides,
  };
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    tenantId: 'tenant-A',
    connectionId: 'conn-1',
    gbpLocationId: 'locations/789',
    name: 'Minha Empresa',
    address: {},
    verificationState: 'VERIFIED',
    syncStatus: 'verified',
    adsCampaignId: null,
    adsCampaignStatus: null,
    adsMonthlyBudget: null,
    adsBudgetMicros: null,
    adsServedAt: null,
    ...overrides,
  };
}

function resetMocks() {
  vi.clearAllMocks();
  dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection());
  dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(makeProfile());
  dbMock.update.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
  });
  dbMock.insert.mockImplementation(() => {
    const valuesResult = Object.assign(Promise.resolve(undefined), {
      returning: vi.fn().mockResolvedValue([]),
    });
    return { values: vi.fn().mockReturnValue(valuesResult) };
  });
  mockCreateGoogleAdsApiClient.mockReturnValue({
    mutateAssetSets: mockMutateAssetSets,
    mutateCustomerAssetSets: mockMutateCustomerAssetSets,
    mutateCampaign: mockMutateCampaign,
    searchStream: mockSearchStream,
  });
  mockMutateAssetSets.mockResolvedValue({ assetSetId: 111, resourceName: 'customers/1/assetSets/111' });
  mockMutateCustomerAssetSets.mockResolvedValue({ resourceName: 'customers/1/customerAssetSets/111' });
  mockMutateCampaign.mockResolvedValue({ campaignId: 999, budgetId: 555 });
}

beforeEach(resetMocks);

describe('googleService.criarCampanhaAds', () => {
  it('cria asset set → attach → campanha e persiste no perfil', async () => {
    const result = await googleService.criarCampanhaAds('profile-1', 'tenant-A', 300);

    expect(mockMutateAssetSets).toHaveBeenCalledWith({
      emailAddress: expect.any(String),
      httpAuthorizationToken: expect.stringContaining('Bearer'),
      assetSetName: expect.stringContaining('Ady'),
    });
    expect(mockMutateCustomerAssetSets).toHaveBeenCalledWith('customers/1/assetSets/111');
    expect(mockMutateCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyBudgetBRL: 300 })
    );

    const setValues = dbMock.update.mock.results[0]?.value.set.mock.calls[0]?.[0] ?? {};
    expect(setValues.adsCampaignId).toBe('999');
    expect(setValues.adsCampaignStatus).toBe('ENABLED');
    expect(setValues.adsMonthlyBudget).toBe('300.00');
    expect(result).toMatchObject({ campaignId: 999, budgetId: 555 });
  });

  it('rejeita verba fora do intervalo permitido', async () => {
    await expect(googleService.criarCampanhaAds('profile-1', 'tenant-A', 5)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(googleService.criarCampanhaAds('profile-1', 'tenant-A', 100_000)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('exige perfil verificado antes de anunciar', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(
      makeProfile({ verificationState: 'UNVERIFIED', syncStatus: 'awaiting_verification' })
    );
    await expect(googleService.criarCampanhaAds('profile-1', 'tenant-A', 300)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('exige conexão com escopo adwords', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue(
      makeConnection({ scopes: ['https://www.googleapis.com/auth/business.manage'] })
    );
    await expect(googleService.criarCampanhaAds('profile-1', 'tenant-A', 300)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('não duplica campanha quando já existe (idempotência)', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(
      makeProfile({ adsCampaignId: '999', adsCampaignStatus: 'ENABLED' })
    );
    await expect(googleService.criarCampanhaAds('profile-1', 'tenant-A', 300)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockMutateAssetSets).not.toHaveBeenCalled();
  });

  it('usa GOOGLE_ADS_API_MOCK sem credenciais reais (não joga erro de token)', async () => {
    vi.stubEnv('GOOGLE_ADS_API_MOCK', 'true');
    const result = await googleService.criarCampanhaAds('profile-1', 'tenant-A', 300);
    expect(result.campaignId).toBe(999);
    expect(mockMutateCampaign).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe('googleService.pauseCampanhaAds', () => {
  it('marca a campanha como pausada no perfil', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(
      makeProfile({ adsCampaignId: '999', adsCampaignStatus: 'ENABLED' })
    );
    const result = await googleService.pauseCampanhaAds('profile-1', 'tenant-A');
    const setValues = dbMock.update.mock.results[0]?.value.set.mock.calls[0]?.[0] ?? {};
    expect(setValues.adsCampaignStatus).toBe('PAUSED');
    expect(result).toMatchObject({ paused: true });
  });

  it('erro amigável quando não há campanha para pausar', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(makeProfile());
    await expect(googleService.pauseCampanhaAds('profile-1', 'tenant-A')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(AppError).toBeDefined();
  });
});