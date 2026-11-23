import { expect, test } from '@playwright/test';

test('superadmin vê conflito de criação sem perder o formulário', async ({ page }) => {
  const apiCalls: Array<{ method: string; path: string }> = [];
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-playwright-session');
    localStorage.setItem('user', JSON.stringify({ platformRole: 'super_admin', role: 'superadmin' }));
  });
  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    apiCalls.push({ method: request.method(), path });
    if (path === '/api/admin/users' && request.method() === 'GET') {
      await route.fulfill({ json: { data: { users: [], total: 0, page: 1, pages: 1, limit: 10 } } });
      return;
    }
    if (path.includes('/check-email/') && request.method() === 'GET') {
      await route.fulfill({ json: { data: { exists: false } } });
      return;
    }
    if (path === '/api/admin/setup-tenant' && request.method() === 'POST') {
      await route.fulfill({
        status: 409,
        json: { success: false, error: { code: 'SLUG_EXISTS', message: 'Slug já existe' } },
      });
      return;
    }
    await route.fulfill({ json: { success: true, data: null } });
  });

  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Novo Cliente' }).click();
  await page.getByLabel('Nome do Tenant').fill('Cliente novo');
  await page.getByLabel('Nome do Usuário').fill('Owner');
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Senha').fill('SenhaSegura1!');
  await page.getByRole('button', { name: 'Criar' }).click();

  await expect(page.getByText('Já existe um cliente com este identificador.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Novo Cliente' })).toBeVisible();
  await expect(page.getByLabel('Nome do Tenant')).toHaveValue('Cliente novo');
  await page.screenshot({ path: '/home/diogo/.hermes/cache/scratch/setup-tenant-conflict.png', fullPage: true });
  expect(apiCalls).toContainEqual({ method: 'POST', path: '/api/admin/setup-tenant' });
});
