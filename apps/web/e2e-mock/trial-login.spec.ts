/*
# Language: pt-BR
Funcionalidade: destino inicial após login
  Cenário: aguarda Trial vigente e abre o chat
  Cenário: plano pago conserva dashboard
  Cenário: Trial expirado mantém o bloqueio
*/
import { expect, test } from '@playwright/test';
for (const scenario of [
  { name: 'Trial vigente', status: 'trial', end: '2099-01-01T00:00:00.000Z', destination: '/chat' },
  { name: 'plano pago', status: 'active', end: null, destination: '/dashboard' },
  { name: 'Trial expirado', status: 'trial', end: '2000-01-01T00:00:00.000Z', destination: '/assinatura-vencida' },
]) {
  test(`login com senha: ${scenario.name}`, async ({ page }) => {
    const user = { id: 'u1', name: 'Teste', email: 'teste@example.test', role: 'owner', tenantId: 'tenant' };
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let requested!: () => void;
    const requestedPromise = new Promise<void>(resolve => { requested = resolve; });
    await page.route('http://127.0.0.1:3100/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/login') return route.fulfill({ json: { data: { token: 'token', refreshToken: 'refresh', user, policy: { currentVersion: 'v1', accepted: true } } } });
      if (path === '/api/billing/subscription') { requested(); await gate; return route.fulfill({ json: { data: { status: scenario.status, trialEndsAt: scenario.end, currentPeriodEnd: null } } }); }
      if (path === '/api/chat/conversations') return route.fulfill({ json: [] });
      if (path === '/api/meta/connections') return route.fulfill({ json: { data: [{ id: 'm1', selectedAdAccountId: 'a1' }] } });
      if (path === '/api/policy/current') return route.fulfill({ json: { data: { accepted: true, currentVersion: 'v1' } } });
      if (path === '/api/rbac/blocked-views') return route.fulfill({ json: { data: { blocked: [] } } });
      return route.fulfill({ json: { data: {} } });
    });
    await page.goto('/login');
    await page.getByPlaceholder('seu@email.com').fill(user.email);
    await page.getByPlaceholder('••••••••').fill('senha123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await requestedPromise;
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByText('Preparando seu acesso…')).toBeVisible();
    release();
    await expect(page).toHaveURL(new RegExp(`${scenario.destination}$`));
  });
}
