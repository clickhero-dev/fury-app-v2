import { expect, test } from '@playwright/test';

test('superadmin altera o status e recupera de conflito pelo painel', async ({ page }) => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  let currentStatus = 'em progresso';
  let conflict = false;
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-playwright-session');
    localStorage.setItem('refreshToken', 'isolated-playwright-refresh');
    localStorage.setItem('user', JSON.stringify({ name: 'QA local', email: 'qa@example.invalid', role: 'superadmin', tenantId: 'isolated' }));
    document.cookie = `ch_consent=${encodeURIComponent(JSON.stringify({ v: '1', level: 'essential', at: new Date().toISOString() }))}; path=/`;
  });
  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.postDataJSON();
    calls.push({ method, path, body });
    if (path === '/api/admin/tickets' && method === 'GET') {
      await route.fulfill({ json: { data: { open: [{ id: 'status-1', name: '[N5] Exportar relatórios', status: currentStatus, priority: 'normal', url: 'https://app.clickup.com/t/status-1', createdAt: '2026-11-06T10:00:00.000Z' }], resolved: [] }, partial_failures: [] } });
      return;
    }
    if (path === '/api/admin/tickets/assignees' && method === 'GET') return route.fulfill({ json: { data: [] } });
    if (path === '/api/admin/tickets/statuses' && method === 'GET') return route.fulfill({ json: { data: [{ value: 'em progresso', label: 'Em progresso', type: 'custom' }, { value: 'triagem', label: 'Triagem', type: 'custom' }] } });
    if (path === '/api/admin/tickets/status-1/status' && method === 'PATCH') {
      if (conflict) return route.fulfill({ status: 409, json: { error: { message: 'O status mudou.' } } });
      currentStatus = (body as { status: string }).status;
      return route.fulfill({ json: { data: { id: 'status-1', status: currentStatus } } });
    }
    return route.fulfill({ status: 404, json: { error: { message: 'Rota inesperada' } } });
  });

  await page.goto('/admin/tickets');
  const ticket = page.getByRole('listitem', { name: 'Alterar status de [N5] Exportar relatórios' });
  await expect(ticket).toBeVisible();
  await ticket.click();
  const dialog = page.getByRole('dialog', { name: 'Alterar status' });
  await page.getByLabel('Novo status').selectOption('triagem');
  await page.getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(ticket.getByText('Triagem', { exact: true })).toBeVisible();
  expect(calls).toContainEqual({ method: 'PATCH', path: '/api/admin/tickets/status-1/status', body: { expectedStatus: 'em progresso', status: 'triagem' } });

  conflict = true;
  await ticket.click();
  await page.getByLabel('Novo status').selectOption('em progresso');
  await page.getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(page.getByText('O status do ticket mudou no ClickUp. Os chamados foram recarregados.')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(ticket).toBeVisible();
});
