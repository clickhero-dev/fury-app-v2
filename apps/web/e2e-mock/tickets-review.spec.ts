import { expect, test } from '@playwright/test';

test('superadmin aprova e reprova tickets em homologação pela tela', async ({ page }) => {
  const apiCalls: Array<{ method: string; path: string; body?: unknown }> = [];
  const tickets = [
    { id: 'review-approve', name: 'Validar exportação', status: 'HOMOLOGAÇÃO', priority: 'high', url: 'https://app.clickup.com/t/review-approve', createdAt: '2026-10-27T10:00:00.000Z' },
    { id: 'review-reject', name: 'Corrigir cadastro móvel', status: 'homologação', priority: 'normal', url: 'https://app.clickup.com/t/review-reject', createdAt: '2026-10-27T10:00:00.000Z' },
    { id: 'other-status', name: 'Ticket em progresso', status: 'em progresso', priority: 'normal', url: 'https://app.clickup.com/t/other-status', createdAt: '2026-10-27T10:00:00.000Z' },
  ];
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
    apiCalls.push({ method, path, body });
    if (path === '/api/admin/tickets' && method === 'GET') {
      await route.fulfill({ json: { data: { open: tickets, resolved: [] }, partial_failures: [] } });
      return;
    }
    if (path === '/api/admin/tickets/assignees' && method === 'GET') {
      await route.fulfill({ json: { data: [] } });
      return;
    }
    const reviewMatch = path.match(/^\/api\/admin\/tickets\/([^/]+)\/review$/);
    if (reviewMatch && method === 'POST') {
      const ticket = tickets.find((item) => item.id === reviewMatch[1]);
      if (!ticket) {
        await route.fulfill({ status: 404, json: { error: { message: 'Ticket não encontrado.' } } });
        return;
      }
      ticket.status = body?.decision === 'approve' ? 'Aprovado' : 'Implement';
      await route.fulfill({ json: { success: true, data: { status: ticket.status } } });
      return;
    }
    await route.fulfill({ json: { success: true, data: null } });
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/admin/tickets');
  await expect(page.getByRole('heading', { name: 'Chamados' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar ticket: Validar exportação' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar ticket: Corrigir cadastro móvel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar ticket: Ticket em progresso' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Revisar ticket: Validar exportação' }).click();
  await expect(page.getByRole('dialog', { name: 'Revisar ticket' })).toContainText('Deseja aprovar ou reprovar este ticket?');
  await page.getByRole('button', { name: 'Aprovar' }).click();
  await expect(page.getByRole('dialog', { name: 'Revisar ticket' })).toHaveCount(0);
  await expect(page.getByRole('tabpanel').getByRole('list').getByText('Aprovado', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Revisar ticket: Corrigir cadastro móvel' }).click();
  await page.getByRole('button', { name: 'Reprovar' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar reprovação' })).toBeDisabled();
  await page.getByLabel('Motivo da reprovação').fill('A tela ainda não se adapta ao celular.');
  await page.getByRole('button', { name: 'Confirmar reprovação' }).click();
  await expect(page.getByRole('dialog', { name: 'Revisar ticket' })).toHaveCount(0);
  await expect(page.getByRole('tabpanel').getByRole('list').getByText('Implement', { exact: true })).toBeVisible();
  await expect(page.getByText('Ticket reprovado e devolvido para implementação.')).toBeVisible();
  await page.screenshot({ path: '/home/diogo/.hermes/cache/scratch/tickets-review-complete.png', fullPage: true });

  expect(apiCalls).toContainEqual({ method: 'POST', path: '/api/admin/tickets/review-approve/review', body: { decision: 'approve' } });
  expect(apiCalls).toContainEqual({ method: 'POST', path: '/api/admin/tickets/review-reject/review', body: { decision: 'reject', reason: 'A tela ainda não se adapta ao celular.' } });
  expect(pageErrors).toEqual([]);
});
