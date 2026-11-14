import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { SocialAuthService } from '../services/core/social-auth.service.js';

const cache = vi.hoisted(() => new Map<string, string>());
const setex = vi.hoisted(() => vi.fn(async (key: string, _ttl: number, value: string) => { cache.set(key, value); }));
vi.mock('../lib/redis.js', () => ({ getRedis: () => ({ setex, get: async (key: string) => cache.get(key), del: async (key: string) => cache.delete(key) }) }));
import { PublicTrialService } from '../services/core/public-trial.service.js';
import { AuthService } from '../services/core/auth.service.js';
import * as tokens from '../lib/jwt.js';

const user = { id: 'u1', tenantId: 't1', email: 'ana@example.com', name: 'Ana', role: 'owner', mustChangePassword: true };
const duration = 30 * 24 * 60 * 60;
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); cache.clear(); setex.mockClear(); });

describe('sessão do trial público', () => {
  it('emite tokens e armazena refresh por 30 dias, mesmo com configurações globais menores, e mantém prazo fixo ao renovar', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubEnv('JWT_EXPIRES_IN', '15m'); vi.stubEnv('JWT_REFRESH_EXPIRES_IN', '7d');
    const trial = new PublicTrialService({ consumeMagicLink: vi.fn().mockResolvedValue({ user }) } as any);
    const first = await trial.access('a'.repeat(64));
    const firstAccess = jwt.decode(first.token) as jwt.JwtPayload;
    const firstRefresh = jwt.decode(first.refreshToken) as jwt.JwtPayload;
    expect(firstAccess.exp! - firstAccess.iat!).toBe(duration);
    expect(firstRefresh.exp! - firstRefresh.iat!).toBe(duration);
    expect(setex).toHaveBeenLastCalledWith('refresh:u1', duration, expect.any(String));

    vi.advanceTimersByTime(10 * 24 * 60 * 60 * 1000);
    const repo = { findUserById: vi.fn().mockResolvedValue(user), isAccountActive: vi.fn().mockResolvedValue(true) };
    const auth = new AuthService(() => repo as any, { jwt: tokens, email: {} } as any);
    const renewed = await auth.refresh({ refreshToken: first.refreshToken });
    const nextAccess = jwt.decode(renewed.tokens.accessToken) as jwt.JwtPayload;
    const nextRefresh = jwt.decode(renewed.tokens.refreshToken) as jwt.JwtPayload;
    expect(nextAccess.exp).toBe(firstAccess.exp);
    expect(nextRefresh.exp).toBe(firstRefresh.exp);
    expect(setex).toHaveBeenLastCalledWith('refresh:u1', 20 * 24 * 60 * 60, expect.any(String));
    vi.advanceTimersByTime(20 * 24 * 60 * 60 * 1000);
    await expect(auth.refresh({ refreshToken: renewed.tokens.refreshToken })).rejects.toMatchObject({ code: 'REFRESH_TOKEN_EXPIRED' });
  });
  it('login por senha e sessão social também duram 30 dias e expiram após renovações', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubEnv('JWT_EXPIRES_IN', '15m'); vi.stubEnv('JWT_REFRESH_EXPIRES_IN', '7d');
    const passwordHash = bcrypt.hashSync('Senha1!', 4);
    const repo = { findUserByEmail: vi.fn().mockResolvedValue({ ...user, passwordHash }), findUserById: vi.fn().mockResolvedValue(user), isAccountActive: vi.fn().mockResolvedValue(true) };
    const auth = new AuthService(() => repo as any, { jwt: tokens, email: {} } as any);
    const social = new SocialAuthService(() => repo as any, { jwt: tokens } as any);
    for (const result of [await auth.login({ email: user.email, password: 'Senha1!' }), { tokens: await social.issueSession(user) }]) {
      const access = jwt.decode(result.tokens.accessToken) as jwt.JwtPayload;
      const refresh = jwt.decode(result.tokens.refreshToken) as jwt.JwtPayload;
      expect(access.exp! - access.iat!).toBe(duration);
      expect(refresh.exp! - refresh.iat!).toBe(duration);
      expect(refresh.sessionExpiresAt).toBe(refresh.exp);
      expect(setex).toHaveBeenLastCalledWith('refresh:u1', duration, expect.any(String));
    }
    const socialSession = await social.issueSession(user);
    vi.advanceTimersByTime(10 * 24 * 60 * 60 * 1000);
    const renewed = await auth.refresh({ refreshToken: socialSession.refreshToken });
    expect((jwt.decode(renewed.tokens.refreshToken) as jwt.JwtPayload).exp).toBe((jwt.decode(socialSession.refreshToken) as jwt.JwtPayload).exp);
    expect(setex).toHaveBeenLastCalledWith('refresh:u1', 20 * 24 * 60 * 60, expect.any(String));
  });

  it('rejeita links inválidos sem emitir sessão', async () => {
    const service = new PublicTrialService({ consumeMagicLink: vi.fn().mockResolvedValue(null) } as any);
    await expect(service.access('a'.repeat(64))).rejects.toMatchObject({ code: 'INVALID_MAGIC_LINK' });
    expect(setex).not.toHaveBeenCalled();
  });
});
