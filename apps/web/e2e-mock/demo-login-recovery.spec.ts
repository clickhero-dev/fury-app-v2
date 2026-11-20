/* # Language: pt-BR
Funcionalidade: recuperação do acesso demo
Cenário: indisponibilidade não autentica e nova tentativa manual entra
*/
import { expect, test } from '@playwright/test';

test('503 não cria sessão e retry manual autentica uma vez', async ({ page }) => {
  let attempts = 0;
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/demo-login') {
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 503, json: { success: false, error: { code: 'DEMO_UNAVAILABLE' } } });
      return route.fulfill({ json: { data: { token: 'access', refreshToken: 'refresh', user: { id: 'demo', name: 'Demo', email: 'demo@example.test', role: 'demo', tenantId: 'demo-tenant' } } } });
    }
    if (path === '/api/policy/current') return route.fulfill({ json: { data: { accepted: true, currentVersion: 'v1' } } });
    return route.fulfill({ json: { data: {} } });
  });
  await page.goto('/login');
  const button = page.getByRole('button', { name: 'Conhecer o ady com uma conta demo' });
  await button.click();
  await expect(page.getByText('A conta demo está temporariamente indisponível. Tente novamente em instantes.')).toBeVisible();
  await expect.poll(() => attempts).toBe(1);
  expect(await page.evaluate(() => [localStorage.getItem('token'), localStorage.getItem('refreshToken'), localStorage.getItem('user')])).toEqual([null, null, null]);
  await button.click();
  await expect.poll(() => attempts).toBe(2);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBe('access');
  await expect(page).not.toHaveURL(/\/login$/);
});
