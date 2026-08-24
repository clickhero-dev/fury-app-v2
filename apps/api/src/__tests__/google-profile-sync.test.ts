/**
 * Testes unitários do sync/atualização de perfil do Google Meu Negócio (US3).
 *
 * Cobre GET /profiles (espelho GBP), PATCH /profiles/:id (update + field mask),
 * POST /profiles/:id/sync (sync imediato), GBP_UPDATE_REJECTED (409) com motivo
 * amigável, e isolamento entre tenants.
 * Mocks no nível de lib/db e lib/google-api — sem HTTP real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptToken } from '../utils/crypto.js';

const {
  dbMock,
  mockCreateGoogleApiClient,
  mockGetLocation,
  mockPatchLocation,
} = vi.hoisted(() => ({
  dbMock: {
    query: {
      googleConnections: { findFirst: vi.fn() },
      googleBusinessProfiles: { findFirst: vi.fn() },
      businessProfileSettings: { findFirst: vi.fn() },
      tenants: { findFirst: vi.fn() },
      googleSyncLogs: { findMany: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as any,
  mockCreateGoogleApiClient: vi.fn(),
  mockGetLocation: vi.fn(),
  mockPatchLocation: vi.fn(),
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

import {
  getProfile,
  updateProfile,
  syncProfile,
  getSyncLogs,
} from '../services/google.service.js';
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

function makeProfile(tenantId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    tenantId,
    connectionId: 'conn-1',
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
    email: 'contato@empresa.com.br',
    website: 'https://empresa.com.br',
    categoryId: 'gcid:bakery',
    categoryDisplayName: 'Padaria',
    hours: null,
    photos: [],
    verificationState: 'VERIFIED',
    syncStatus: 'verified',
    lastSyncedAt: new Date(Date.now() - 86400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function resetMocks() {
  vi.clearAllMocks();
  mockCreateGoogleApiClient.mockReturnValue({
    getLocation: mockGetLocation,
    patchLocation: mockPatchLocation,
    listAccounts: vi.fn(),
    listLocations: vi.fn(),
    createLocation: vi.fn(),
    searchGoogleLocations: vi.fn(),
    fetchVerificationOptions: vi.fn(),
    verifyLocation: vi.fn(),
    listVerifications: vi.fn(),
    listCategories: vi.fn(),
  });
  dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection('tenant-A'));
  dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(makeProfile('tenant-A'));
  dbMock.update.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  dbMock.insert.mockImplementation((values: Record<string, unknown>) => {
    const valuesResult = Object.assign(Promise.resolve(undefined), {
      returning: vi.fn().mockResolvedValue([]),
    });
    return { values: vi.fn().mockReturnValue(valuesResult), _insertValues: values };
  });
}

describe('getProfile — espelho GBP (US3)', () => {
  beforeEach(resetMocks);

  it('retorna o perfil espelhado com dados do GBP', async () => {
    mockGetLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda Atualizada',
      phoneNumbers: { primaryPhone: '+5511988888888' },
      websiteUri: 'https://nova-empresa.com.br',
      emailAddress: 'novo@empresa.com.br',
      categories: [{ categoryId: 'gcid:coffee_shop', displayName: 'Cafeteria' }],
      address: {
        addressLines: ['Rua Nova 200'],
        locality: 'Campinas',
        administrativeArea: 'SP',
        postalCode: '13010-000',
        regionCode: 'BR',
      },
      verification: { state: 'VERIFIED' },
      metadata: { canOperateGoogleMyBusiness: true },
      profile: { totalReviewCount: 25 },
    });

    const result = await getProfile('profile-1', 'tenant-A');

    expect(mockGetLocation).toHaveBeenCalledWith('accounts/123456/locations/789');
    expect(result.name).toBe('Minha Empresa Ltda Atualizada');
    expect(result.phone).toBe('+5511988888888');
    expect(result.website).toBe('https://nova-empresa.com.br');
    expect(result.syncStatus).toBe('verified');
    expect(result.verificationState).toBe('VERIFIED');
  });

  it('404 NOT_FOUND para perfil de outro tenant', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(null);

    await expect(getProfile('profile-outro', 'tenant-B')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('atualiza lastSyncedAt após buscar dados frescos do GBP', async () => {
    mockGetLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      phoneNumbers: { primaryPhone: '+5511999999999' },
      verification: { state: 'VERIFIED' },
    });

    await getProfile('profile-1', 'tenant-A');

    const setValues = dbMock.update.mock.results[0]?.value.set.mock.calls[0]?.[0] ?? {};
    expect(setValues.lastSyncedAt).toBeDefined();
  });
});

describe('updateProfile — PATCH com field mask (US3)', () => {
  beforeEach(resetMocks);

  it('atualiza campos permitidos e retorna perfil com syncStatus syncing', async () => {
    mockPatchLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Padaria Estrela',
      phoneNumbers: { primaryPhone: '+5511977777777' },
      verification: { state: 'VERIFIED' },
    });

    const result = await updateProfile('profile-1', 'tenant-A', {
      name: 'Padaria Estrela',
      phone: '+5511977777777',
    });

    expect(mockPatchLocation).toHaveBeenCalledTimes(1);
    const [locationName, updates] = mockPatchLocation.mock.calls[0] as [string, Record<string, unknown>];
    expect(locationName).toBe('accounts/123456/locations/789');
    expect(updates.title).toBe('Padaria Estrela');
    expect(updates.phoneNumbers).toEqual({ primaryPhone: '+5511977777777' });

    expect(result.syncStatus).toBe('synced');
    expect(result.name).toBe('Padaria Estrela');
  });

  it('atualiza horário de funcionamento e gera field mask correto', async () => {
    mockPatchLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      openInfo: {
        periods: [
          {
            openDay: 'MONDAY',
            openTime: { hours: 7, minutes: 0 },
            closeDay: 'MONDAY',
            closeTime: { hours: 19, minutes: 0 },
          },
        ],
      },
      verification: { state: 'VERIFIED' },
    });

    const result = await updateProfile('profile-1', 'tenant-A', {
      hours: {
        monday: [{ open: '07:00', close: '19:00' }],
      },
    });

    const [locationName, updates] = mockPatchLocation.mock.calls[0] as [string, Record<string, unknown>];
    expect(updates.openInfo).toBeDefined();
    expect(result.syncStatus).toBe('synced');
  });

  it('GBP_UPDATE_REJECTED (409) quando o Google recusa a atualização', async () => {
    mockPatchLocation.mockRejectedValue(
      new AppError(400, 'GOOGLE_API_ERROR', 'Invalid address format.', {
        googleError: { message: 'Invalid address format.' },
      })
    );

    await expect(
      updateProfile('profile-1', 'tenant-A', {
        address: { street: '', city: '', state: '', postalCode: '', country: 'BR' },
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'GBP_UPDATE_REJECTED',
    });

    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('404 NOT_FOUND para perfil de outro tenant', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(null);

    await expect(
      updateProfile('profile-outro', 'tenant-B', { name: 'Tentativa' })
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('ignora campos que não mudaram (diff antes do PATCH)', async () => {
    mockPatchLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      verification: { state: 'VERIFIED' },
    });

    const result = await updateProfile('profile-1', 'tenant-A', {
      name: 'Minha Empresa Ltda',
    });

    expect(mockPatchLocation).not.toHaveBeenCalled();
    expect(result.syncStatus).toBe('synced');
    expect(result.name).toBe('Minha Empresa Ltda');
  });
});

describe('syncProfile — sync imediato (US3)', () => {
  beforeEach(resetMocks);

  it('busca dados frescos do GBP e atualiza o espelho local', async () => {
    mockGetLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      phoneNumbers: { primaryPhone: '+5511999999999' },
      verification: { state: 'VERIFIED' },
      profile: { totalReviewCount: 30 },
    });

    const result = await syncProfile('profile-1', 'tenant-A');

    expect(mockGetLocation).toHaveBeenCalledWith('accounts/123456/locations/789');
    expect(result.syncStatus).toBe('verified');
    expect(result.lastSyncedAt).toBeDefined();
  });

  it('404 NOT_FOUND para perfil de outro tenant', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(null);

    await expect(syncProfile('profile-outro', 'tenant-B')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('escreve log de sincronização com status success', async () => {
    mockGetLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      phoneNumbers: { primaryPhone: '+5511999999999' },
      verification: { state: 'VERIFIED' },
    });

    await syncProfile('profile-1', 'tenant-A');

    expect(dbMock.insert).toHaveBeenCalled();
  });
});

describe('getSyncLogs — histórico de operações (US3)', () => {
  beforeEach(resetMocks);

  it('retorna logs cronológicos do perfil', async () => {
    dbMock.query.googleSyncLogs.findMany.mockResolvedValue([
      {
        id: 'log-1',
        operation: 'create',
        status: 'success',
        message: 'Perfil criado. Aguardando verificação.',
        createdAt: new Date(Date.now() - 172800_000),
      },
      {
        id: 'log-2',
        operation: 'verify',
        status: 'success',
        message: 'Perfil verificado pelo Google.',
        createdAt: new Date(Date.now() - 86400_000),
      },
    ]);

    const result = await getSyncLogs('profile-1', 'tenant-A');

    expect(result.logs).toHaveLength(2);
    expect(result.logs[0].operation).toBe('create');
    expect(result.logs[1].operation).toBe('verify');
  });

  it('404 NOT_FOUND para perfil de outro tenant', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(null);

    await expect(getSyncLogs('profile-outro', 'tenant-B')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});
