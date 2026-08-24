/**
 * Testes unitários da verificação de perfil do Google Meu Negócio (US2).
 *
 * Cobre fetchVerificationOptions → métodos elegíveis, verifyLocation enviando
 * PIN para PHONE/EMAIL, orientação por cartão postal (POSTAL) e a transição de
 * estado awaiting_verification → verified quando o Google confirma.
 * Mocks no nível de lib/db e lib/google-api — sem HTTP real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptToken } from '../utils/crypto.js';

const {
  dbMock,
  mockCreateGoogleApiClient,
  mockFetchVerificationOptions,
  mockVerifyLocation,
  mockGetLocation,
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
  mockFetchVerificationOptions: vi.fn(),
  mockVerifyLocation: vi.fn(),
  mockGetLocation: vi.fn(),
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

import { getVerification, completeVerification } from '../services/google.service.js';

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
    verificationState: 'UNVERIFIED',
    syncStatus: 'awaiting_verification',
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function resetMocks() {
  vi.clearAllMocks();
  mockCreateGoogleApiClient.mockReturnValue({
    fetchVerificationOptions: mockFetchVerificationOptions,
    verifyLocation: mockVerifyLocation,
    getLocation: mockGetLocation,
  });
  dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection('tenant-A'));
  dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(makeProfile('tenant-A'));
  dbMock.update.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  dbMock.insert.mockImplementation(() => {
    const valuesResult = Object.assign(Promise.resolve(undefined), {
      returning: vi.fn().mockResolvedValue([]),
    });
    return { values: vi.fn().mockReturnValue(valuesResult) };
  });
}

describe('getVerification — fetchVerificationOptions', () => {
  beforeEach(resetMocks);

  it('retorna os métodos elegíveis mapeados do contrato', async () => {
    mockFetchVerificationOptions.mockResolvedValue([
      { verificationMethod: 'POSTAL', announcement: 'Enviar cartão postal para o endereço comercial' },
      { verificationMethod: 'PHONE', announcement: 'Verificar por telefone' },
      { verificationMethod: 'EMAIL', announcement: 'Verificar por email' },
    ]);

    const result = await getVerification('profile-1', 'tenant-A');

    expect(mockFetchVerificationOptions).toHaveBeenCalledWith('accounts/123456/locations/789');
    expect(result.verificationState).toBe('UNVERIFIED');
    expect(result.options).toEqual([
      { method: 'POSTAL', description: 'Enviar cartão postal para o endereço comercial' },
      { method: 'PHONE', description: 'Verificar por telefone' },
      { method: 'EMAIL', description: 'Verificar por email' },
    ]);
    expect(result.instructions).toBeTruthy();
  });

  it('ignora métodos fora de POSTAL/PHONE/EMAIL', async () => {
    mockFetchVerificationOptions.mockResolvedValue([
      { verificationMethod: 'SMS', announcement: 'Verificar por SMS' },
      { verificationMethod: 'PHONE', announcement: 'Verificar por telefone' },
    ]);

    const result = await getVerification('profile-1', 'tenant-A');

    expect(result.options).toEqual([{ method: 'PHONE', description: 'Verificar por telefone' }]);
  });

  it('perfil já verificado não busca opções de verificação', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(
      makeProfile('tenant-A', { verificationState: 'VERIFIED', syncStatus: 'verified' })
    );

    const result = await getVerification('profile-1', 'tenant-A');

    expect(mockFetchVerificationOptions).not.toHaveBeenCalled();
    expect(result).toMatchObject({ verificationState: 'VERIFIED' });
  });

  it('404 NOT_FOUND para perfil de outro tenant', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(null);

    await expect(getVerification('profile-outro', 'tenant-B')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('completeVerification — PIN por PHONE/EMAIL', () => {
  beforeEach(resetMocks);

  it('envia PIN via verifyLocation para PHONE', async () => {
    mockVerifyLocation.mockResolvedValue({ status: 'PENDING' });
    mockGetLocation.mockResolvedValue({ verification: { state: 'UNVERIFIED' } });

    const result = await completeVerification('profile-1', 'tenant-A', 'PHONE');

    expect(mockVerifyLocation).toHaveBeenCalledTimes(1);
    expect(mockVerifyLocation).toHaveBeenCalledWith('accounts/123456/locations/789', 'PHONE');
    expect(result).toEqual({ verificationState: 'UNVERIFIED', awaitingPin: true });
  });

  it('envia PIN via verifyLocation para EMAIL', async () => {
    mockVerifyLocation.mockResolvedValue({ status: 'PENDING' });
    mockGetLocation.mockResolvedValue({ verification: { state: 'UNVERIFIED' } });

    const result = await completeVerification('profile-1', 'tenant-A', 'EMAIL');

    expect(mockVerifyLocation).toHaveBeenCalledWith('accounts/123456/locations/789', 'EMAIL');
    expect(result.awaitingPin).toBe(true);
  });

  it('orienta por cartão postal quando method é POSTAL (não envia PIN)', async () => {
    const result = await completeVerification('profile-1', 'tenant-A', 'POSTAL');

    expect(mockVerifyLocation).not.toHaveBeenCalled();
    expect(result.verificationState).toBe('UNVERIFIED');
    expect(result.postalGuidance).toBe(true);
    expect(result.instructions).toBeTruthy();
  });

  it('transição awaiting_verification → verified quando o Google confirma', async () => {
    mockVerifyLocation.mockResolvedValue({ status: 'PENDING' });
    mockGetLocation.mockResolvedValue({ verification: { state: 'VERIFIED' } });

    const result = await completeVerification('profile-1', 'tenant-A', 'EMAIL');

    expect(result).toEqual({ verificationState: 'VERIFIED', syncStatus: 'verified' });

    const setValues = dbMock.update.mock.results[0]?.value.set.mock.calls[0]?.[0] ?? {};
    expect(setValues.verificationState).toBe('VERIFIED');
    expect(setValues.syncStatus).toBe('verified');
  });

  it('404 NOT_FOUND para perfil de outro tenant', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(null);

    await expect(completeVerification('profile-outro', 'tenant-B', 'PHONE')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});