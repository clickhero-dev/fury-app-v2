import { describe, it, expect, vi } from 'vitest';
import { SocialAuthService } from '../services/core/social-auth.service.js';

vi.mock('../lib/redis.js', () => ({
  getRedis: () => ({ setex: vi.fn(async () => {}), del: vi.fn(async () => {}), get: vi.fn(async () => null) }),
}));

function makeRepo() {
  return { findUserByGoogleId: vi.fn(), findUserByEmail: vi.fn(), findTenantBySlug: vi.fn(), patchUser: vi.fn() } as any;
}

function makeSvc() {
  return new SocialAuthService(
    () => makeRepo(),
    {
      jwt: { generateAccessToken: vi.fn(() => 'at'), generateRefreshToken: vi.fn(() => 'rt') },
      googleOauth: { getGoogleOAuthConfig: vi.fn(() => ({ clientId: 'cid', clientSecret: 'cs' })) },
      facebookOauth: {
        getFacebookOAuthConfig: vi.fn(() => ({ appId: 'fbid', appSecret: 'fbsecret' })),
        exchangeCodeForToken: vi.fn(async () => ({ access_token: 'fbtok' })),
        fetchFacebookUserInfo: vi.fn(async () => ({ id: 'FB123', name: 'Ana', email: 'Ana@Example.com ' })),
      },
    } as any,
  );
}

describe('SocialAuthService (deep DI)', () => {
  it('generateSocialLoginUrl monta URL com scope userinfo (sem business.manage)', () => {
    const url = makeSvc().generateSocialLoginUrl('http://cb', 'cid');
    expect(url).toContain('oauth2/v2/auth');
    expect(url).toContain('userinfo.email');
    expect(url).toContain('userinfo.profile');
    expect(url).not.toContain('business.manage');
  });

  it('generateSocialLoginUrl inclui state quando passado', () => {
    const url = makeSvc().generateSocialLoginUrl('http://cb', 'cid', 'st-1');
    expect(url).toContain('state=st-1');
  });
});

// ── Facebook social login ─────────────────────────────────────────────────
function makeFbSvc(repoOverrides: Record<string, unknown> = {}, userInfo?: Record<string, unknown>) {
  const repo = {
    findUserByFacebookId: vi.fn(async () => null),
    findUserByEmail: vi.fn(async () => null),
    findTenantBySlug: vi.fn(async () => null),
    patchUser: vi.fn(async () => {}),
    ...repoOverrides,
  } as any;
  const svc = new SocialAuthService(
    () => repo,
    {
      jwt: { generateAccessToken: vi.fn(() => 'at'), generateRefreshToken: vi.fn(() => 'rt') },
      googleOauth: { getGoogleOAuthConfig: vi.fn() },
      facebookOauth: {
        getFacebookOAuthConfig: vi.fn(() => ({ appId: 'fbid', appSecret: 'fbsecret' })),
        exchangeCodeForToken: vi.fn(async () => ({ access_token: 'fbtok' })),
        fetchFacebookUserInfo: vi.fn(async () => userInfo ?? { id: 'FB123', name: 'Ana', email: 'Ana@Example.com ' }),
      },
    } as any,
  );
  return { svc, repo };
}

describe('SocialAuthService.issueSession', () => {
  it('gera par de tokens via jwt e não vaza refresh recuperável', async () => {
    const { svc } = makeFbSvc();
    const tokens = await svc.issueSession({ id: 'u1', tenantId: 't1', email: 'a@b.com', role: 'owner' });
    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt' });
  });
});

function fakeTxDb() {
  const tx = {
    insert: vi.fn(() => ({ values: (v: any) => ({ returning: async () => [{ id: v.slug ? 't1' : 'u1', ...v }] }) })),
    update: vi.fn(() => ({ set: () => ({ where: async () => {} }) })),
  };
  return { transaction: vi.fn(async (cb: any) => cb(tx)) } as any;
}

describe('SocialAuthService.generateFacebookLoginUrl', () => {
  it('monta URL do dialog com scope public_profile,email e response_type=code', () => {
    const url = makeFbSvc().svc.generateFacebookLoginUrl('http://cb', 'st-1');
    expect(url).toContain('facebook.com');
    expect(url).toContain('/dialog/oauth');
    expect(url).toContain('scope=public_profile%2Cemail');
    expect(url).toContain('response_type=code');
    expect(url).toContain('state=st-1');
    expect(url).not.toContain('pages_show_list');
    expect(url).not.toContain('ads_');
  });
});

describe('SocialAuthService.handleFacebookSocialLogin', () => {
  it('cria tenant + user novo, normalizando o e-mail', async () => {
    const { svc, repo } = makeFbSvc();
    const db = fakeTxDb();
    const r = await svc.handleFacebookSocialLogin('code', 'http://cb', db);

    expect(repo.findUserByFacebookId).toHaveBeenCalledWith('FB123');
    expect(repo.findUserByEmail).toHaveBeenCalledWith('ana@example.com');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(r.isNewUser).toBe(true);
    expect(r.user.email).toBe('ana@example.com');
    // não emite tokens aqui — isso é feito em issueSession/handoff
    expect(r).not.toHaveProperty('tokens');
  });

  it('loga usuário já vinculado por facebookId sem tocar em e-mail nem criar tenant', async () => {
    const existing = { id: 'u9', tenantId: 't9', email: 'x@y.com', role: 'owner' };
    const { svc, repo } = makeFbSvc({ findUserByFacebookId: vi.fn(async () => existing) });
    const db = fakeTxDb();
    const r = await svc.handleFacebookSocialLogin('code', 'http://cb', db);

    expect(repo.findUserByEmail).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(r.isNewUser).toBe(false);
  });

  it('vincula facebookId a conta comum existente com o mesmo e-mail', async () => {
    const existing = { id: 'u5', tenantId: 't5', email: 'ana@example.com', role: 'owner' };
    const { svc, repo } = makeFbSvc({ findUserByEmail: vi.fn(async () => existing) });
    const db = fakeTxDb();
    const r = await svc.handleFacebookSocialLogin('code', 'http://cb', db);

    expect(repo.patchUser).toHaveBeenCalledWith('u5', { facebookId: 'FB123', emailVerified: true });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(r.isNewUser).toBe(false);
  });

  it('NUNCA auto-vincula a conta privilegiada (superadmin/admin) — bloqueia com 409', async () => {
    for (const role of ['superadmin', 'admin']) {
      const existing = { id: 'u0', tenantId: 't0', email: 'ana@example.com', role };
      const { svc, repo } = makeFbSvc({ findUserByEmail: vi.fn(async () => existing) });
      await expect(svc.handleFacebookSocialLogin('code', 'http://cb', fakeTxDb())).rejects.toMatchObject({
        statusCode: 409,
        code: 'ACCOUNT_LINK_NOT_ALLOWED',
      });
      expect(repo.patchUser).not.toHaveBeenCalled();
    }
  });

  it('recusa quando o Facebook não retorna e-mail', async () => {
    const { svc, repo } = makeFbSvc({}, { id: 'FB123', name: 'Ana' });
    await expect(svc.handleFacebookSocialLogin('code', 'http://cb', fakeTxDb())).rejects.toThrow(/e-mail/i);
    expect(repo.findUserByFacebookId).not.toHaveBeenCalled();
  });
});
