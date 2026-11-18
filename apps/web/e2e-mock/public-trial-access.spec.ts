/*
# Language: pt-BR

Funcionalidade: acesso automático ao trial público

  Cenário: usuário criado pelo webhook consome o link e define a senha
    Dado um link de acesso válido recebido após o webhook de trial
    Quando o usuário entra no Ady
    Então a sessão é persistida, o chat é aberto sem onboarding Meta
    E o acesso não é bloqueado pela criação de senha
*/
import { expect, test } from '@playwright/test';

test('Trial público: o link cria sessão, abre o chat sem exigir nova senha', async ({ page }) => {
  const apiCalls: Array<{ method: string; path: string; body?: unknown }> = [];

  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    apiCalls.push({ method: request.method(), path, body: request.postDataJSON() });

    if (path === '/api/public/trial/access' && request.method() === 'POST') {
      await route.fulfill({ json: {
        success: true,
        data: {
          token: 'trial-access-token',
          refreshToken: 'trial-refresh-token',
          user: { id: 'trial-user', name: 'Ana Trial', email: 'ana@example.test', role: 'owner', tenantId: 'trial-tenant', mustChangePassword: true },
        },
      } });
      return;
    }
    if (path === '/api/auth/set-password' && request.method() === 'POST') {
      await route.fulfill({ json: { success: true } });
      return;
    }
    if (path === '/api/policy/current') {
      await route.fulfill({ json: { data: { currentVersion: 'v1', currentVersionId: 'v1', accepted: true, content: null } } });
      return;
    }
    if (path === '/api/billing/subscription') {
      await route.fulfill({ json: { data: { status: 'trial', trialEndsAt: '2099-01-01T00:00:00.000Z', currentPeriodEnd: '2099-01-01T00:00:00.000Z' } } });
      return;
    }
    if (path === '/api/rbac/blocked-views' || path === '/api/notifications') {
      await route.fulfill({ json: { data: { blocked: [], items: [], nextCursor: null, unreadCount: 0 } } });
      return;
    }
    await route.fulfill({ status: 200, json: { success: true, data: {} } });
  });

  const magicToken = 'a'.repeat(64);
  await page.goto(`/trial/acesso#token=${magicToken}`);

  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole('dialog', { name: 'Crie sua senha' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem('token'),
    trial: localStorage.getItem('fury-public-trial'),
    passwordPending: localStorage.getItem('fury-trial-password-pending'),
  }))).toEqual({ token: 'trial-access-token', trial: 'true', passwordPending: 'true' });

  expect(apiCalls).toContainEqual({ method: 'POST', path: '/api/public/trial/access', body: { token: magicToken } });
  expect(apiCalls.some(({ path }) => path === '/api/auth/set-password')).toBe(false);
});
