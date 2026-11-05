import { describe, it, expect, beforeAll, vi } from 'vitest';
import { GoogleService } from '../services/google/google.service.js';
import { encryptToken } from '../utils/crypto.js';
import { AppError } from '../middleware/errorHandler.js';

function makeProfile(override: Record<string, any> = {}) {
  return {
    id: 'p-1',
    connectionId: 'conn-1',
    gbpLocationId: 'accounts/111/locations/abc',
    name: 'Padaria do Bairro',
    phone: '+55 11 99999-9999',
    email: '',
    website: '',
    categoryId: null,
    categoryDisplayName: null,
    hours: null,
    photos: [],
    verificationState: 'VERIFIED',
    syncStatus: 'synced',
    lastSyncedAt: null,
    ...override,
  };
}

function makeConnection() {
  return {
    id: 'conn-1',
    googleUserId: 'g-user-1',
    accountId: 'accounts/111',
    accountName: 'Minha Empresa',
    accessToken: encryptToken('plain-access-token'),
    refreshToken: encryptToken('plain-refresh-token'),
    tokenExpiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeRepo(override: Record<string, any> = {}) {
  return {
    getBusinessProfile: vi.fn(async () => null),
    findGoogleConnectionByRawId: vi.fn(async () => null),
    ...override,
  } as any;
}

function makeDeps(getLocation: any = vi.fn(async () => null)) {
  return {
    oauth: {},
    api: { createGoogleApiClient: vi.fn(() => ({ getLocation })) },
    storage: {},
  } as any;
}

const RECENT_LOCATION = {
  name: 'accounts/111/locations/abc',
  title: 'Padaria do Bairro',
  address: { addressLines: ['Rua das Flores, 100'], locality: 'São Paulo' },
  phoneNumbers: { primaryPhone: '+55 11 99999-9999' },
  websiteUri: 'https://padaria.com.br',
  categories: [{ categoryId: 'gcid:bakery' }],
  openInfo: { periods: [{ openDay: 'MONDAY' }] },
  verification: { state: 'VERIFIED' },
  metadata: { updateTime: new Date(Date.now() - 30 * 24 * 3600_000).toISOString() },
};

describe('GoogleService.assessProfile', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key-32-chars!!';
  });

  it('busca a location real do GBP e devolve o relatório de qualidade', async () => {
    const getLocation = vi.fn(async () => RECENT_LOCATION);
    const repo = makeRepo({
      getBusinessProfile: vi.fn(async () => makeProfile()),
      findGoogleConnectionByRawId: vi.fn(async () => makeConnection()),
    });
    const svc = new GoogleService(() => repo, makeDeps(getLocation));

    const report = await svc.assessProfile('p-1', 't1');

    expect(repo.getBusinessProfile).toHaveBeenCalledWith('p-1');
    expect(repo.findGoogleConnectionByRawId).toHaveBeenCalledWith('conn-1');
    expect(getLocation).toHaveBeenCalledWith('accounts/111/locations/abc');
    expect(report).toMatchObject({
      grade: 'EXCELLENT',
      complete: true,
      verified: true,
      outdated: false,
      missingFields: [],
    });
    expect(report.score).toBeGreaterThanOrEqual(90);
  });

  it('lança 404 quando o perfil não existe', async () => {
    const repo = makeRepo({ getBusinessProfile: vi.fn(async () => null) });
    const svc = new GoogleService(() => repo, makeDeps());

    await expect(svc.assessProfile('missing', 't1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('lança 404 quando não há conexão Google para o perfil', async () => {
    const repo = makeRepo({
      getBusinessProfile: vi.fn(async () => makeProfile()),
      findGoogleConnectionByRawId: vi.fn(async () => null),
    });
    const svc = new GoogleService(() => repo, makeDeps());

    await expect(svc.assessProfile('p-1', 't1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('propaga erro AppError 404 em conexão perdida via getLocation (AppError)', async () => {
    const getLocation = vi.fn(async () => {
      throw new AppError(404, 'NOT_FOUND', 'Location not found');
    });
    const repo = makeRepo({
      getBusinessProfile: vi.fn(async () => makeProfile()),
      findGoogleConnectionByRawId: vi.fn(async () => makeConnection()),
    });
    const svc = new GoogleService(() => repo, makeDeps(getLocation));

    await expect(svc.assessProfile('p-1', 't1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});