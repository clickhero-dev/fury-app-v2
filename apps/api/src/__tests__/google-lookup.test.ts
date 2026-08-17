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
} = vi.hoisted(() => ({
  dbMock: {
    query: {
      googleConnections: { findFirst: vi.fn() },
      businessProfileSettings: { findFirst: vi.fn() },
      tenants: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as any,
  mockCreateGoogleApiClient: vi.fn(),
  mockSearchGoogleLocations: vi.fn(),
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

import { lookupGoogleProfile, getGoogleAccounts } from '../services/google.service.js';

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
    listAccounts: vi.fn(),
  });
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

    const result = await lookupGoogleProfile('tenant-A');

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
          phone: '+5511999999999',
          verificationState: 'VERIFIED',
          claimed: true,
          confidence: 'HIGH',
        },
      ],
    });
  });

  it('não encontrado quando a busca não retorna matches', async () => {
    mockSearchGoogleLocations.mockResolvedValue([]);

    const result = await lookupGoogleProfile('tenant-A');

    expect(result).toEqual({ found: false, matches: [], duplicateAlert: false });
  });

  it('duplicateAlert=true quando existem matches não reivindicados (FR-011)', async () => {
    mockSearchGoogleLocations.mockResolvedValue([makeUnclaimedMatch()]);

    const result = await lookupGoogleProfile('tenant-A');

    expect(result.found).toBe(false);
    expect(result.duplicateAlert).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].confidence).toBe('HIGH');
    expect(result.matches[0].claimed).toBe(false);
  });

  it('funciona sem business_profile_settings usando dados do tenant', async () => {
    dbMock.query.businessProfileSettings.findFirst.mockResolvedValue(null);
    mockSearchGoogleLocations.mockResolvedValue([makeClaimedVerifiedMatch()]);

    const result = await lookupGoogleProfile('tenant-A');

    const searchParams = mockSearchGoogleLocations.mock.calls[0][0];
    expect(searchParams.location.title).toBe('Minha Empresa Ltda');
    expect(result.found).toBe(true);
  });

  it('sem nome do negócio retorna não encontrado sem chamar a API', async () => {
    dbMock.query.businessProfileSettings.findFirst.mockResolvedValue(null);
    dbMock.query.tenants.findFirst.mockResolvedValue({ ...makeTenant('tenant-A'), name: '' });

    const result = await lookupGoogleProfile('tenant-A');

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

    await expect(lookupGoogleProfile('tenant-A')).rejects.toMatchObject({
      statusCode: 401,
      code: 'GOOGLE_TOKEN_EXPIRED',
    });
  });

  it('isola por tenant: tenant B nunca vê a conexão do tenant A (NOT_FOUND)', async () => {
    dbMock.query.googleConnections.findFirst.mockImplementation(({ where }: { where: unknown }) => {
      const condition = (where as { type: string; b: string }) ?? { b: '' };
      return condition.b === 'tenant-A' ? Promise.resolve(makeConnection('tenant-A')) : Promise.resolve(null);
    });

    await expect(lookupGoogleProfile('tenant-B')).rejects.toMatchObject({
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
    dbMock.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });

    const result = await getGoogleAccounts('tenant-A');

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
    dbMock.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });

    const result = await getGoogleAccounts('tenant-A');

    expect(result.selectedAccountId).toBe('accounts/654321');
  });

  it('NOT_FOUND sem conexão Google', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue(null);

    await expect(getGoogleAccounts('tenant-B')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});