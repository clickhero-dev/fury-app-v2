import { describe, it, expect, vi } from 'vitest';
import { SocialAuthService } from '../services/core/social-auth.service.js';

function makeRepo() {
  return { findUserByGoogleId: vi.fn(), findUserByEmail: vi.fn(), findTenantBySlug: vi.fn(), patchUser: vi.fn() } as any;
}

function makeSvc() {
  return new SocialAuthService(
    () => makeRepo(),
    {
      jwt: { generateAccessToken: vi.fn(() => 'at'), generateRefreshToken: vi.fn(() => 'rt') },
      googleOauth: { getGoogleOAuthConfig: vi.fn(() => ({ clientId: 'cid', clientSecret: 'cs' })) },
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