/**
 * Testes do OAuth Google com escopos Ads (Fluxo 3 — F3.3).
 *
 * Cobre:
 *  - generateGoogleAuthUrl com context='ads' adiciona o escopo adwords mantendo business.manage
 *  - callback OAuth persiste os escopos concedidos (scopes[]) na conexão
 *  - getGoogleConnection expõe scopes e adsConnected para o frontend decidir UI
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { encryptToken } from '../utils/crypto.js';

const {
  dbMock,
  mockExchangeCodeForToken,
  mockGetGoogleOAuthConfig,
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
  mockExchangeCodeForToken: vi.fn(),
  mockGetGoogleOAuthConfig: vi.fn(),
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

vi.mock('../lib/google-oauth.js', () => ({
  exchangeCodeForToken: mockExchangeCodeForToken,
  getGoogleOAuthConfig: mockGetGoogleOAuthConfig,
  revokeGoogleToken: vi.fn(),
}));

import { googleService } from '../services/google/google.service.js';

const OAUTH_CONFIG = {
  clientId: 'client-123.apps.googleusercontent.com',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:3333/api/google/auth/callback',
};

function resetMocks() {
  vi.clearAllMocks();
  mockGetGoogleOAuthConfig.mockReturnValue(OAUTH_CONFIG);
  mockExchangeCodeForToken.mockResolvedValue({
    access_token: 'ya29.new-token',
    refresh_token: '1//new-refresh',
    expires_in: 3600,
    scope: '',
    id_token: jwt.sign({ sub: 'google-user-123', email: 'contato@empresa.com.br' }, 'any-secret'),
  });
  dbMock.query.googleConnections.findFirst.mockResolvedValue(null);
  dbMock.insert.mockImplementation(() => {
    const returning = Promise.resolve([{ id: 'conn-1', tenantId: 'tenant-1' }]);
    const valuesResult = Object.assign(returning, {
      returning: vi.fn().mockReturnValue(returning),
    });
    return { values: vi.fn().mockReturnValue(valuesResult) };
  });
  dbMock.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
  });
}

beforeEach(resetMocks);

describe('OAuth Ads — escopo adwords', () => {
  it('generateGoogleAuthUrl com context ads inclui adwords + business.manage', () => {
    const url = googleService.generateGoogleAuthUrl('tenant-1', 'ads');
    const parsed = new URL(url);
    const scopes = parsed.searchParams.get('scope') ?? '';
    expect(scopes).toContain('https://www.googleapis.com/auth/adwords');
    expect(scopes).toContain('https://www.googleapis.com/auth/business.manage');
  });

  it('generateGoogleAuthUrl sem context ads NÃO inclui adwords', () => {
    const url = googleService.generateGoogleAuthUrl('tenant-1', 'settings');
    const scopes = new URL(url).searchParams.get('scope') ?? '';
    expect(scopes).not.toContain('adwords');
    expect(scopes).toContain('https://www.googleapis.com/auth/business.manage');
  });

  it('callback OAuth persiste scopes concedidos na conexão', async () => {
    mockExchangeCodeForToken.mockResolvedValue({
      access_token: 'ya29.new-token',
      refresh_token: '1//new-refresh',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/adwords',
      id_token: jwt.sign({ sub: 'google-user-123', email: 'contato@empresa.com.br' }, 'any-secret'),
    });

    const authUrl = googleService.generateGoogleAuthUrl('tenant-1', 'ads');
    const state = new URL(authUrl).searchParams.get('state') ?? '';

    await googleService.handleGoogleOAuthCallback('code-valid', state);

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    const values = dbMock.insert.mock.results[0].value.values.mock.calls[0][0] as Record<string, unknown>;
    expect(values.scopes).toContain('https://www.googleapis.com/auth/adwords');
    expect(values.scopes).toContain('https://www.googleapis.com/auth/business.manage');
    expect(googleService).toBeDefined();
    expect(jwt).toBeDefined();
  });

  it('getGoogleConnection expõe adsConnected=false quando falta o escopo adwords', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue({
      id: 'conn-1',
      tenantId: 'tenant-1',
      googleUserId: 'google-user-123',
      accessToken: encryptToken('ya29.fake'),
      refreshToken: encryptToken('1//fake'),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      accountId: 'accounts/123456',
      accountName: 'Minha Empresa Ltda',
      scopes: ['https://www.googleapis.com/auth/business.manage'],
    });

    const connection = await googleService.getGoogleConnection('tenant-1');
    expect(connection?.scopes).toContain('https://www.googleapis.com/auth/business.manage');
    expect(connection?.adsConnected).toBe(false);
  });

  it('getGoogleConnection expõe adsConnected=true quando o escopo adwords existe', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue({
      id: 'conn-1',
      tenantId: 'tenant-1',
      googleUserId: 'google-user-123',
      accessToken: encryptToken('ya29.fake'),
      refreshToken: encryptToken('1//fake'),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      accountId: 'accounts/123456',
      accountName: 'Minha Empresa Ltda',
      scopes: [
        'https://www.googleapis.com/auth/business.manage',
        'https://www.googleapis.com/auth/adwords',
      ],
    });

    const connection = await googleService.getGoogleConnection('tenant-1');
    expect(connection?.adsConnected).toBe(true);
  });
});