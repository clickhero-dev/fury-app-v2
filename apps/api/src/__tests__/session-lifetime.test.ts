import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const redis = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => { values.set(key, value); return 'OK'; }),
    del: vi.fn(async (key: string) => { values.delete(key); return 1; }),
  };
});
vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));

import { AuthService } from '../services/core/auth.service.js';
import { SocialAuthService } from '../services/core/social-auth.service.js';

describe('prazo absoluto da sessão', () => {
  const user = { id: 'session-user', tenantId: 't1', email: 'session@example.com', role: 'owner', passwordHash: '' };
  const repo = {
    findUserByEmail: vi.fn(async () => user),
    findUserById: vi.fn(async () => user),
    isAccountActive: vi.fn(async () => true),
  };
  const service = new AuthService(() => repo as any);

  beforeEach(async () => {
    redis.values.clear();
    vi.clearAllMocks();
    user.passwordHash = await bcrypt.hash('secret', 4);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('mantém o mesmo prazo e aceita renovações simultâneas sem invalidar a sessão', async () => {
    const login = await service.login({ email: user.email, password: 'secret' });
    const deadline = (jwt.decode(login.tokens.refreshToken) as { exp: number }).exp;
    expect(redis.setex).toHaveBeenCalledWith(`refresh:${user.id}`, 30 * 24 * 60 * 60, expect.any(String));
    vi.advanceTimersByTime(29 * 24 * 60 * 60 * 1000);
    const [first, second] = await Promise.all([
      service.refresh({ refreshToken: login.tokens.refreshToken }),
      service.refresh({ refreshToken: login.tokens.refreshToken }),
    ]);
    expect(first.tokens.refreshToken).toBe(login.tokens.refreshToken);
    expect(second.tokens.refreshToken).toBe(login.tokens.refreshToken);
    expect((jwt.decode(first.tokens.accessToken) as { exp: number }).exp).toBe(deadline);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    await expect(service.refresh({ refreshToken: login.tokens.refreshToken })).rejects.toMatchObject({ code: 'REFRESH_TOKEN_EXPIRED' });
  });

  it('não renova sessão revogada', async () => {
    const login = await service.login({ email: user.email, password: 'secret' });
    await service.logout(user.id);
    await expect(service.refresh({ refreshToken: login.tokens.refreshToken })).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('aplica o mesmo prazo de 30 dias ao login social', async () => {
    const social = new SocialAuthService();
    const tokens = await social.issueSession(user);
    const refresh = jwt.decode(tokens.refreshToken) as { iat: number; exp: number };
    const access = jwt.decode(tokens.accessToken) as { exp: number };
    expect(refresh.exp - refresh.iat).toBe(30 * 24 * 60 * 60);
    expect(access.exp).toBeLessThanOrEqual(refresh.exp);
    expect(redis.setex).toHaveBeenCalledWith(`refresh:${user.id}`, 30 * 24 * 60 * 60, expect.any(String));
  });
});
