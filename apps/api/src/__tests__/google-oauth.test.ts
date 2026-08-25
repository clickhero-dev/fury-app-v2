/**
 * Testes unitários do fluxo OAuth do Google Meu Negócio (US1).
 *
 * Cobre assinatura/validação do state JWT (10m), troca code→token,
 * criptografia AES-256-GCM dos tokens em repouso (utils/crypto.ts),
 * upsert 1-por-tenant em google_connections, INVALID_OAUTH_STATE e
 * redirecionamento do callback para o frontend com ?connected=true.
 * Mocks no nível de lib/db — sem dependência de HTTP real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import express from 'express';

const {
  dbMock,
  mockExchangeCodeForToken,
  mockGetGoogleOAuthConfig,
  mockRevokeGoogleToken,
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
  mockRevokeGoogleToken: vi.fn(),
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
  revokeGoogleToken: mockRevokeGoogleToken,
}));

import { generateGoogleAuthUrl, handleGoogleOAuthCallback, disconnectGoogleConnection } from '../services/google/google.service.js';
import { encryptToken, decryptToken } from '../utils/crypto.js';
import { AppError } from '../middleware/errorHandler.js';
import googleRoutes from '../routes/google.routes.js';

const OAUTH_CONFIG = {
  clientId: 'client-123.apps.googleusercontent.com',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:3000/api/google/auth/callback',
};

const FRONTEND_URL = 'http://localhost:5173';

function makeTokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'ya29.fake-access-token',
    refresh_token: '1//fake-refresh-token',
    expires_in: 3600,
    id_token: jwt.sign({ sub: 'google-user-123', email: 'contato@empresa.com.br' }, 'any-secret'),
    ...overrides,
  };
}

function makeEncryptedTokenValue(values: Record<string, unknown>): Record<string, unknown> {
  return values;
}

function resetMocks() {
  vi.clearAllMocks();
  process.env.FRONTEND_URL = FRONTEND_URL;
  mockGetGoogleOAuthConfig.mockReturnValue(OAUTH_CONFIG);
  mockExchangeCodeForToken.mockResolvedValue(makeTokenResponse());
  dbMock.query.googleConnections.findFirst.mockResolvedValue(null);
  dbMock.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  dbMock.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
  dbMock.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
}

function buildTestApp() {
  const app = express();
  app.use('/api/google', googleRoutes);
  return app;
}

describe('Google OAuth — state JWT', () => {
  beforeEach(resetMocks);

  it('gera URL de autorização com escopo business.manage, access_type=offline e state', () => {
    const authUrl = generateGoogleAuthUrl('tenant-1', 'settings');
    const parsed = new URL(authUrl);

    expect(parsed.origin).toBe('https://accounts.google.com');
    expect(parsed.searchParams.get('client_id')).toBe(OAUTH_CONFIG.clientId);
    expect(parsed.searchParams.get('redirect_uri')).toBe(OAUTH_CONFIG.redirectUri);
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/business.manage');
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');

    const state = parsed.searchParams.get('state') ?? '';
    const decoded = jwt.decode(state) as { tenantId?: string; context?: string; iat?: number; exp?: number };
    expect(decoded.tenantId).toBe('tenant-1');
    expect(decoded.context).toBe('settings');
  });

  it('state JWT expira em 10 minutos', () => {
    const authUrl = generateGoogleAuthUrl('tenant-1', 'settings');
    const state = new URL(authUrl).searchParams.get('state') ?? '';
    const decoded = jwt.decode(state) as { iat?: number; exp?: number };

    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
    const ttlSeconds = (decoded.exp as number) - (decoded.iat as number);
    expect(ttlSeconds).toBe(600);
  });

  it('rejeita INVALID_OAUTH_STATE quando o state é inválido ou expirado', async () => {
    await expect(handleGoogleOAuthCallback('code-valid', 'state-invalido')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_OAUTH_STATE',
    });
  });
});

describe('Google OAuth — criptografia AES-256-GCM em repouso', () => {
  it('encryptToken produz formato iv:tag:ciphertext e decryptToken recupera o original', () => {
    const token = 'ya29.raw-secret-token';
    const encrypted = encryptToken(token);

    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // iv 12 bytes
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // auth tag 16 bytes
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);

    expect(decryptToken(encrypted)).toBe(token);
  });

  it('decryptToken rejeita payloads malformados', () => {
    expect(() => decryptToken('payload-sem-formato')).toThrow();
  });
});

describe('Google OAuth — handleGoogleOAuthCallback (upsert 1-por-tenant)', () => {
  beforeEach(resetMocks);

  it('insere conexão quando não existe para o tenant', async () => {
    const authUrl = generateGoogleAuthUrl('tenant-1', 'settings');
    const state = new URL(authUrl).searchParams.get('state') ?? '';

    const result = await handleGoogleOAuthCallback('code-valid', state);

    expect(mockExchangeCodeForToken).toHaveBeenCalledWith('code-valid');
    expect(dbMock.query.googleConnections.findFirst).toHaveBeenCalled();
    expect(dbMock.insert).toHaveBeenCalledTimes(1);

    const values = dbMock.insert.mock.results[0].value.values.mock.calls[0][0] as Record<string, unknown>;
    expect(values.tenantId).toBe('tenant-1');
    expect(values.googleUserId).toBe('google-user-123');
    expect(String(values.accessToken).split(':')).toHaveLength(3);
    expect(String(values.refreshToken).split(':')).toHaveLength(3);

    expect(result).toMatchObject({
      tenantId: 'tenant-1',
      context: 'settings',
      returnUrl: '/configuracoes/google-meu-negocio?connected=true',
    });
  });

  it('atualiza (não duplica) a conexão quando já existe para o tenant', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue({
      id: 'conn-existing',
      tenantId: 'tenant-1',
      googleUserId: 'google-user-antigo',
      accessToken: encryptToken('antigo'),
      refreshToken: encryptToken(''),
      tokenExpiresAt: new Date(Date.now() + 1000),
    });

    const authUrl = generateGoogleAuthUrl('tenant-1', 'settings');
    const state = new URL(authUrl).searchParams.get('state') ?? '';

    const result = await handleGoogleOAuthCallback('code-valid', state);

    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.update).toHaveBeenCalledTimes(1);

    const values = dbMock.update.mock.results[0].value.set.mock.calls[0][0] as Record<string, unknown>;
    expect(values.googleUserId).toBe('google-user-123');
    expect(String(values.accessToken).split(':')).toHaveLength(3);
    expect(result.returnUrl).toContain('connected=true');
  });
});

describe('Google OAuth — callback HTTP (rota pública)', () => {
  beforeEach(resetMocks);

  it('redireciona para o frontend com ?connected=true', async () => {
    const authUrl = generateGoogleAuthUrl('tenant-1', 'settings');
    const state = new URL(authUrl).searchParams.get('state') ?? '';
    const app = buildTestApp();

    const response = await request(app).get('/api/google/auth/callback').query({ code: 'code-valid', state });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `${FRONTEND_URL}/configuracoes/google-meu-negocio?connected=true`
    );
  });

  it('redireciona com ?error=invalid_state quando o state é inválido', async () => {
    const app = buildTestApp();

    const response = await request(app)
      .get('/api/google/auth/callback')
      .query({ code: 'code-valid', state: 'state-tampered' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `${FRONTEND_URL}/configuracoes/google-meu-negocio?error=invalid_state`
    );
  });

  it('redireciona com ?error=token_exchange_failed quando a troca do code falha', async () => {
    mockExchangeCodeForToken.mockRejectedValue(
      new AppError(502, 'GOOGLE_TOKEN_EXCHANGE_FAILED', 'Falha na troca do code por token no Google.')
    );

    const authUrl = generateGoogleAuthUrl('tenant-1', 'settings');
    const state = new URL(authUrl).searchParams.get('state') ?? '';
    const app = buildTestApp();

    const response = await request(app).get('/api/google/auth/callback').query({ code: 'code-bad', state });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `${FRONTEND_URL}/configuracoes/google-meu-negocio?error=token_exchange_failed`
    );
  });

  it('redireciona com ?error=oauth_cancelled quando o usuário recusa o consentimento', async () => {
    const app = buildTestApp();

    const response = await request(app)
      .get('/api/google/auth/callback')
      .query({ error: 'access_denied' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `${FRONTEND_URL}/configuracoes/google-meu-negocio?error=oauth_cancelled`
    );
  });

  it('redireciona com ?error=oauth_cancelled em falhas inesperadas', async () => {
    mockExchangeCodeForToken.mockRejectedValue(new Error('network boom'));
    const authUrl = generateGoogleAuthUrl('tenant-1', 'settings');
    const state = new URL(authUrl).searchParams.get('state') ?? '';
    const app = buildTestApp();

    const response = await request(app).get('/api/google/auth/callback').query({ code: 'code-valid', state });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      `${FRONTEND_URL}/configuracoes/google-meu-negocio?error=oauth_cancelled`
    );
  });
});

describe('Google OAuth — revogação na desconexão', () => {
  beforeEach(resetMocks);

  it('revoga o token e remove a conexão', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue({
      id: 'conn-1',
      tenantId: 'tenant-1',
      googleUserId: 'google-user-123',
      accessToken: encryptToken('ya29.revogavel'),
      refreshToken: encryptToken(''),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    const result = await disconnectGoogleConnection('conn-1', 'tenant-1');

    expect(mockRevokeGoogleToken).toHaveBeenCalledWith('ya29.revogavel');
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'conn-1', disconnected: true });
  });

  it('404 NOT_FOUND para conexão de outro tenant', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue(null);

    await expect(disconnectGoogleConnection('conn-de-outro', 'tenant-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});