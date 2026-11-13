import { test, expect } from '@playwright/test';

for (const provider of ['google', 'facebook'] as const) {
  test(`${provider}: Trial aguarda aceite e abre chat`, async ({ page }) => {
    const user = { id: 'u1', name: 'Teste', email: 'teste@example.test', role: 'owner', tenantId: 'tenant' };
    const session = { token: 'token', refreshToken: 'refresh', user, isNewUser: false, policy: { currentVersion: 'v1', accepted: false } };
    let accepted = false;
    await page.route('http://127.0.0.1:3100/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/social/handoff') return route.fulfill({ json: { data: session } });
      if (path === '/api/billing/subscription') return route.fulfill({ json: { data: { status: 'trial', trialEndsAt: '2099-01-01T00:00:00Z' } } });
      if (path === '/api/policy/current') return route.fulfill({ json: { data: { accepted, currentVersion: 'v1', currentVersionId: 'v1', content: 'Termos de uso' } } });
      if (path === '/api/policy/accept') { accepted = true; return route.fulfill({ json: { data: { accepted: true, currentVersion: 'v1' } } }); }
      if (path === '/api/chat/conversations') return route.fulfill({ json: [] });
      if (path === '/api/meta/connections') return route.fulfill({ json: { data: [{ id: 'm1', selectedAdAccountId: 'a1' }] } });
      if (path === '/api/rbac/blocked-views') return route.fulfill({ json: { data: { blocked: [] } } });
      return route.fulfill({ json: { data: {} } });
    });
    const query = provider === 'google' ? `social_login=${encodeURIComponent(JSON.stringify(session))}` : 'fb_handoff=handoff';
    await page.goto(`/login?${query}`);
    await expect(page).toHaveURL(/\/politica$/);
    await page.getByTestId('policy-agree-checkbox').check();
    await page.getByTestId('policy-accept-button').click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByTestId('policy-accept-button')).toHaveCount(0);
  });
}
