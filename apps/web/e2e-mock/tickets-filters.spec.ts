import { expect, test } from '@playwright/test';

test('superadmin filtra tickets localmente por assunto e status e preserva filtros ao atualizar', async ({ page }) => {
  const apiCalls: string[] = [];
  const tickets = [
    { id: 'one', name: '[N2] Erro de publicação', status: 'release', priority: 'normal', url: 'https://app.clickup.com/t/one', createdAt: '2026-10-27T10:00:00.000Z' },
    { id: 'two', name: '[N1] Erro de acesso', status: 'release', priority: 'high', url: 'https://app.clickup.com/t/two', createdAt: '2026-10-27T10:00:00.000Z' },
    { id: 'three', name: '[N3] Erro de publicação', status: 'monitoring', priority: 'normal', url: 'https://app.clickup.com/t/three', createdAt: '2026-10-27T10:00:00.000Z' },
  ];
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-playwright-session');
    localStorage.setItem('refreshToken', 'isolated-playwright-refresh');
    localStorage.setItem('user', JSON.stringify({ name: 'QA local', email: 'qa@example.invalid', role: 'superadmin', tenantId: 'isolated' }));
  });
  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    apiCalls.push(path);
    if (path === '/api/admin/tickets') {
      await route.fulfill({ json: { data: { open: tickets, resolved: [{ ...tickets[0], id: 'four', name: '[N2] Publicação resolvida' }] }, partial_failures: [] } });
    } else if (path === '/api/admin/tickets/assignees') {
      await route.fulfill({ json: { data: [] } });
    } else {
      await route.fulfill({ status: 404, json: { error: 'unexpected isolated API request' } });
    }
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/admin/tickets');
  await expect(page.getByRole('heading', { name: 'Chamados' })).toBeVisible();
  await expect(page.getByText('[N2] Erro de publicação')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Pesquisar por assunto' }).fill(' PUBLICAÇÃO ');
  await page.getByRole('combobox', { name: 'Status' }).selectOption('release');
  await expect(page.getByRole('tabpanel').getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('tabpanel').getByText('[N2] Erro de publicação')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Abertos/ })).toContainText('1');

  await page.getByRole('tab', { name: /Resolvidos/ }).click();
  await expect(page.getByRole('tabpanel').getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Atualizar' }).click();
  await expect(page.getByRole('searchbox', { name: 'Pesquisar por assunto' })).toHaveValue(' PUBLICAÇÃO ');
  await expect(page.getByRole('tabpanel').getByText('[N2] Publicação resolvida')).toBeVisible();
  await page.screenshot({ path: '/home/diogo/.hermes/cache/scratch/tickets-status-search.png', fullPage: true });
  expect(apiCalls.every((path) => ['/api/admin/tickets', '/api/admin/tickets/assignees'].includes(path))).toBe(true);
  expect(errors).toEqual([]);
});
