import { expect, test } from '@playwright/test';
// Dado 502, quando tenta novamente, então recupera sem inventar status.
test('recupera status no diálogo administrativo', async ({ page }) => {
  let unavailable = true;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-session');
    localStorage.setItem('refreshToken', 'isolated-refresh');
    localStorage.setItem('user', JSON.stringify({ name: 'QA', email: 'qa@example.invalid', role: 'superadmin', tenantId: 'isolated' }));
  });
  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    expect(route.request().method()).toBe('GET');
    if (path === '/api/admin/tickets') {
      await route.fulfill({ json: { data: { open: [{ id: 'one', name: 'Falha de publicação', status: 'release', priority: 'normal', url: 'https://app.clickup.com/t/one', createdAt: '2026-11-16T10:00:00Z' }], resolved: [] }, partial_failures: [] } });
    } else if (path === '/api/admin/tickets/statuses') {
      await route.fulfill(unavailable ? { status: 502, json: { error: { code: 'TICKET_PROVIDER_UNAVAILABLE' } } } : { json: { data: [{ value: 'release', label: 'Release', type: 'custom' }, { value: 'triagem', label: 'Triagem', type: 'open' }] } });
    } else if (path === '/api/admin/tickets/assignees') {
      await route.fulfill({ json: { data: [] } });
    } else if (path === '/api/rbac/blocked-views') {
      await route.fulfill({ json: { data: { blocked: [] } } });
    } else { await route.fulfill({ status: 404, json: {} }); }
  });
  await page.goto('/admin/tickets');
  await page.getByRole('listitem', { name: 'Alterar status de Falha de publicação' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Não foi possível carregar os status');
  await expect(dialog.getByRole('combobox')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Confirmar alteração' })).toBeDisabled();
  unavailable = false;
  await dialog.getByRole('button', { name: 'Tentar carregar status novamente' }).click();
  await expect(dialog.getByRole('combobox')).toBeEnabled();
  await dialog.getByRole('combobox').selectOption('triagem');
  await expect(dialog.getByRole('button', { name: 'Confirmar alteração' })).toBeEnabled();
  await page.screenshot({ path: '/tmp/tickets-status-recovery.png' });
  expect(errors).toEqual([]);
});
