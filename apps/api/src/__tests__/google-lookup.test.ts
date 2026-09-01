/**
 * Testes unitários do lookup de perfil existente no Google (US1).
 *
 * Cobre googleLocations:search → matches normalizados, detecção de duplicado
 * (duplicateAlert — FR-011), isolamento entre tenants (tenant A nunca vê
 * dados de tenant B) e GOOGLE_TOKEN_EXPIRED em falha de refresh.
 * Mocks no nível de lib/db e lib/google-api — sem HTTP real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptToken } from '../utils/crypto.js';

const {
  dbMock,
  mockCreateGoogleApiClient,
  mockSearchGoogleLocations,
  mockCreateLocation,
  mockListCategories,
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
  mockCreateGoogleApiClient: vi.fn(),
  mockSearchGoogleLocations: vi.fn(),
  mockCreateLocation: vi.fn(),
  mockListCategories: vi.fn(),
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

vi.mock('../lib/google-api.js', () => ({
  createGoogleApiClient: mockCreateGoogleApiClient,
}));

import { googleService } from '../services/google/google.service.js';
import { AppError } from '../middleware/errorHandler.js';

function makeConnection(tenantId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    tenantId,
    googleUserId: 'google-user-123',
    accessToken: encryptToken('ya29.fake-access'),
    refreshToken: encryptToken('1//fake-refresh'),
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    accountId: 'accounts/123456',
    accountName: 'Minha Empresa Ltda',
    ...overrides,
  };
}

function makeSettings(tenantId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'settings-1',
    tenantId,
    name: 'Minha Empresa Ltda',
    address: {
      street: 'Av. Paulista 1000',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01310-100',
      country: 'BR',
    },
    phone: '+5511999999999',
    email: 'contato@empresa.com.br',
    website: 'https://empresa.com.br',
    categoryId: 'gcid:bakery',
    hours: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTenant(tenantId: string) {
  return {
    id: tenantId,
    name: 'Minha Empresa Ltda',
    slug: `slug-${tenantId}`,
    codigo: null,
    businessContext: 'Padaria artesanal',
    createdAt: new Date(),
  };
}

function makeClaimedVerifiedMatch() {
  return {
    locationName: 'accounts/123456/locations/789',
    placeId: 'ChIJmockplaceid',
    location: {
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      address: {
        addressLines: ['Av. Paulista 1000'],
        locality: 'São Paulo',
        administrativeArea: 'SP',
        postalCode: '01310-100',
        regionCode: 'BR',
      },
      phoneNumbers: { primaryPhone: '+5511999999999' },
      verification: { state: 'VERIFIED' },
      metadata: { canOperateGoogleMyBusiness: true },
    },
  };
}

function makeUnclaimedMatch() {
  return {
    locationName: 'accounts/999999/locations/123',
    placeId: 'ChIJotherplace',
    location: {
      name: 'accounts/999999/locations/123',
      title: 'Minha Empresa Ltda',
      address: { addressLines: ['Rua Outra 42'], locality: 'São Paulo', regionCode: 'BR' },
      phoneNumbers: { primaryPhone: '+5511987654321' },
      verification: { state: 'UNVERIFIED' },
      metadata: { canOperateGoogleMyBusiness: false },
    },
  };
}

function resetMocks() {
  vi.clearAllMocks();
  mockCreateGoogleApiClient.mockReturnValue({
    searchGoogleLocations: mockSearchGoogleLocations,
    createLocation: mockCreateLocation,
    listCategories: mockListCategories,
    listAccounts: vi.fn(),
  });
  dbMock.insert.mockImplementation(() => {
    const valuesResult = Object.assign(Promise.resolve(undefined), {
      returning: vi.fn().mockResolvedValue([{ id: 'profile-1', name: 'Minha Empresa Ltda' }]),
    });
    return { values: vi.fn().mockReturnValue(valuesResult) };
  });
  dbMock.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'conn-1' }]) }),
    }),
  });
  mockListCategories.mockResolvedValue([
    { categoryId: 'gcid:bakery', displayName: 'Padaria' },
    { categoryId: 'gcid:coffee_shop', displayName: 'Cafeteria' },
  ]);
}

describe('lookupGoogleProfile — googleLocations:search', () => {
  beforeEach(() => {
    resetMocks();
    dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection('tenant-A'));
    dbMock.query.businessProfileSettings.findFirst.mockResolvedValue(makeSettings('tenant-A'));
    dbMock.query.tenants.findFirst.mockResolvedValue(makeTenant('tenant-A'));
  });

  it('mapeia os matches do googleLocations:search para o contrato', async () => {
    mockSearchGoogleLocations.mockResolvedValue([makeClaimedVerifiedMatch()]);

    const result = await googleService.lookupGoogleProfile('tenant-A');

    expect(mockSearchGoogleLocations).toHaveBeenCalledTimes(1);
    const searchParams = mockSearchGoogleLocations.mock.calls[0][0];
    expect(searchParams.languageCode).toBe('pt-BR');
    expect(searchParams.location.title).toBe('Minha Empresa Ltda');
    expect(searchParams.location.phoneNumbers?.primaryPhone).toBe('+5511999999999');

    expect(result).toEqual({
      found: true,
      duplicateAlert: false,
      matches: [
        {
          gbpLocationId: 'accounts/123456/locations/789',
          name: 'Minha Empresa Ltda',
          address: {
            street: 'Av. Paulista 1000',
            city: 'São Paulo',
            state: 'SP',
            postalCode: '01310-100',
            country: 'BR',
          },
          phone: expect.any(String),
          verificationState: 'VERIFIED',
          claimed: true,
          confidence: 'HIGH',
          quality: expect.objectContaining({
            complete: true,
            verified: true,
            grade: 'GOOD',
            score: 85,
            missingFields: [],
            recommendations: ['website', 'category', 'hours'],
          }),
        },
      ],
    });
  });

  it('não encontrado quando a busca não retorna matches', async () => {
    mockSearchGoogleLocations.mockResolvedValue([]);

    const result = await googleService.lookupGoogleProfile('tenant-A');

    expect(result).toEqual({ found: false, matches: [], duplicateAlert: false });
  });

  it('duplicateAlert=true quando existem matches não reivindicados (FR-011)', async () => {
    mockSearchGoogleLocations.mockResolvedValue([makeUnclaimedMatch()]);

    const result = await googleService.lookupGoogleProfile('tenant-A');

    expect(result.found).toBe(false);
    expect(result.duplicateAlert).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe('HIGH');
    expect(result.matches[0].claimed).toBe(false);
  });

  it('funciona sem business_profile_settings usando dados do tenant', async () => {
    dbMock.query.businessProfileSettings.findFirst.mockResolvedValue(null);
    mockSearchGoogleLocations.mockResolvedValue([makeClaimedVerifiedMatch()]);

    const result = await googleService.lookupGoogleProfile('tenant-A');

    const searchParams = mockSearchGoogleLocations.mock.calls[0][0];
    expect(searchParams.location.title).toBe('Minha Empresa Ltda');
    expect(result.found).toBe(true);
  });

  it('sem nome do negócio retorna não encontrado sem chamar a API', async () => {
    dbMock.query.businessProfileSettings.findFirst.mockResolvedValue(null);
    dbMock.query.tenants.findFirst.mockResolvedValue({ ...makeTenant('tenant-A'), name: '' });

    const result = await googleService.lookupGoogleProfile('tenant-A');

    expect(mockSearchGoogleLocations).not.toHaveBeenCalled();
    expect(result).toEqual({ found: false, matches: [], duplicateAlert: false });
  });
});

describe('lookupGoogleProfile — erros e isolamento', () => {
  beforeEach(resetMocks);

  it('GOOGLE_TOKEN_EXPIRED (401) quando a busca falha por refresh do token', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection('tenant-A'));
    dbMock.query.businessProfileSettings.findFirst.mockResolvedValue(makeSettings('tenant-A'));
    dbMock.query.tenants.findFirst.mockResolvedValue(makeTenant('tenant-A'));
    mockSearchGoogleLocations.mockRejectedValue(
      Object.assign(new Error('refresh failed'), {
        statusCode: 401,
        code: 'GOOGLE_TOKEN_EXPIRED',
      })
    );

    await expect(googleService.lookupGoogleProfile('tenant-A')).rejects.toMatchObject({
      statusCode: 401,
      code: 'GOOGLE_TOKEN_EXPIRED',
    });
  });

  it('isola por tenant: tenant B nunca vê a conexão do tenant A (NOT_FOUND)', async () => {
    dbMock.query.googleConnections.findFirst.mockImplementation(({ where }: { where: unknown }) => {
      const condition = (where as { type: string; b: string }) ?? { b: '' };
      return condition.b === 'tenant-A' ? Promise.resolve(makeConnection('tenant-A')) : Promise.resolve(null);
    });

    await expect(googleService.lookupGoogleProfile('tenant-B')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('getGoogleAccounts — listAccounts + selectedAccountId', () => {
  beforeEach(resetMocks);

  it('lista contas e persiste a seleção na conexão', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue(
      makeConnection('tenant-A', { accountId: null, accountName: null })
    );
    const mockListAccounts = vi.fn().mockResolvedValue([
      { name: 'accounts/123456', accountName: 'Minha Empresa Ltda', type: 'PERSONAL' },
      { name: 'accounts/654321', accountName: 'Outra Empresa', type: 'AGENCY' },
    ]);
    mockCreateGoogleApiClient.mockReturnValue({ listAccounts: mockListAccounts });
    dbMock.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'conn-1' }]) }),
      }),
    });

    const result = await googleService.getGoogleAccounts('tenant-A');

    expect(result.accounts).toEqual([
      { accountId: 'accounts/123456', accountName: 'Minha Empresa Ltda' },
      { accountId: 'accounts/654321', accountName: 'Outra Empresa' },
    ]);
    expect(result.selectedAccountId).toBe('accounts/123456');

    const values = dbMock.update.mock.results[0].value.set.mock.calls[0][0] as Record<string, unknown>;
    expect(values.accountId).toBe('accounts/123456');
    expect(values.accountName).toBe('Minha Empresa Ltda');
  });

  it('mantém a conta previamente selecionada quando ainda existe', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue(
      makeConnection('tenant-A', { accountId: 'accounts/654321', accountName: 'Outra Empresa' })
    );
    const mockListAccounts = vi.fn().mockResolvedValue([
      { name: 'accounts/123456', accountName: 'Minha Empresa Ltda', type: 'PERSONAL' },
      { name: 'accounts/654321', accountName: 'Outra Empresa', type: 'AGENCY' },
    ]);
    mockCreateGoogleApiClient.mockReturnValue({ listAccounts: mockListAccounts });
    dbMock.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'conn-1' }]) }),
      }),
    });

    const result = await googleService.getGoogleAccounts('tenant-A');

    expect(result.selectedAccountId).toBe('accounts/654321');
  });

  it('NOT_FOUND sem conexão Google', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue(null);

    await expect(googleService.getGoogleAccounts('tenant-B')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('createProfile — bloqueios e criação (US2)', () => {
  beforeEach(() => {
    resetMocks();
    dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection('tenant-A'));
    dbMock.query.businessProfileSettings.findFirst.mockResolvedValue(makeSettings('tenant-A'));
    dbMock.query.tenants.findFirst.mockResolvedValue(makeTenant('tenant-A'));
  });

  it('409 DUPLICATE_LOCATION quando o lookup tem confiança HIGH (FR-011)', async () => {
    mockSearchGoogleLocations.mockResolvedValue([makeUnclaimedMatch()]);

    await expect(googleService.createProfile('tenant-A')).rejects.toMatchObject({
      statusCode: 409,
      code: 'DUPLICATE_LOCATION',
      details: {
        matches: [{ gbpLocationId: 'accounts/999999/locations/123', confidence: 'HIGH' }],
      },
    });

    expect(mockCreateLocation).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('400 BUSINESS_SETTINGS_INCOMPLETE quando faltam dados do negócio', async () => {
    dbMock.query.businessProfileSettings.findFirst.mockResolvedValue(
      makeSettings('tenant-A', { phone: '', categoryId: '' })
    );
    mockSearchGoogleLocations.mockResolvedValue([]);

    await expect(googleService.createProfile('tenant-A')).rejects.toMatchObject({
      statusCode: 400,
      code: 'BUSINESS_SETTINGS_INCOMPLETE',
    });

    expect(mockCreateLocation).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('cria a location na GBP e persiste o espelho com syncStatus awaiting_verification', async () => {
    mockSearchGoogleLocations.mockResolvedValue([]);
    mockCreateLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
    });

    const result = await googleService.createProfile('tenant-A');

    expect(mockCreateLocation).toHaveBeenCalledTimes(1);
    const [accountName, payload] = mockCreateLocation.mock.calls[0] as [string, Record<string, unknown>];
    expect(accountName).toBe('accounts/123456');
    expect(payload.title).toBe('Minha Empresa Ltda');
    expect(payload.categories).toEqual([{ categoryId: 'gcid:bakery' }]);
    expect(payload.phoneNumbers).toEqual({ primaryPhone: '+5511999999999' });

    expect(result).toMatchObject({
      id: 'profile-1',
      gbpLocationId: 'accounts/123456/locations/789',
      name: 'Minha Empresa Ltda',
      syncStatus: 'awaiting_verification',
      verificationState: 'UNVERIFIED',
      created: true,
    });

    expect(dbMock.insert).toHaveBeenCalledTimes(2);
    const profileValues = dbMock.insert.mock.calls[0][0];
    expect(profileValues).toBeDefined();
    const insertedProfile = dbMock.insert.mock.results[0].value.values.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedProfile.syncStatus).toBe('awaiting_verification');
    expect(insertedProfile.verificationState).toBe('UNVERIFIED');
    expect(insertedProfile.tenantId).toBe('tenant-A');

    const insertedLog = dbMock.insert.mock.results[1].value.values.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedLog.operation).toBe('create');
    expect(insertedLog.status).toBe('success');
    expect(insertedLog.message).toContain('Aguardando verificação');
  });

  it('422 GBP_CREATION_NOT_SUPPORTED com orientação manual quando o Google recusa', async () => {
    mockSearchGoogleLocations.mockResolvedValue([]);
    mockCreateLocation.mockRejectedValue(
      new AppError(422, 'GOOGLE_API_ERROR', 'Google não suporta criação automática neste país.')
    );

    await expect(googleService.createProfile('tenant-A')).rejects.toMatchObject({
      statusCode: 422,
      code: 'GBP_CREATION_NOT_SUPPORTED',
      details: { reason: 'Google não suporta criação automática neste país.' },
    });

    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('propaga GOOGLE_TOKEN_EXPIRED (401) sem converter em 422', async () => {
    mockSearchGoogleLocations.mockResolvedValue([]);
    mockCreateLocation.mockRejectedValue(
      Object.assign(new Error('refresh failed'), { statusCode: 401, code: 'GOOGLE_TOKEN_EXPIRED' })
    );

    await expect(googleService.createProfile('tenant-A')).rejects.toMatchObject({
      statusCode: 401,
      code: 'GOOGLE_TOKEN_EXPIRED',
    });
  });

  it('devolve quality por match derivada da location completa do Google (pré-envio)', async () => {
    mockSearchGoogleLocations.mockResolvedValue([makeClaimedVerifiedMatch()]);

    const result = await googleService.lookupGoogleProfile('tenant-A');

    expect(result.matches[0].quality).toBeDefined();
    expect(result.matches[0].quality).toMatchObject({
      complete: true, // nome/endereço/telefone presentes no match
      verified: true,
      grade: expect.stringMatching(/EXCELLENT|GOOD/),
    });
    expect(result.matches[0].quality).not.toBeNull();
  });

  it('quality é null quando o match não traz location completa', async () => {
    mockSearchGoogleLocations.mockResolvedValue([
      { locationName: 'accounts/123456/locations/789', placeId: 'ChIJmockplaceid' },
    ]);

    const result = await googleService.lookupGoogleProfile('tenant-A');

    expect(result.matches[0].quality).toBeNull();
  });
});