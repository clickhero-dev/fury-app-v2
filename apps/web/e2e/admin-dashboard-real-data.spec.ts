import { test, expect } from '@playwright/test';

/*
 * Funcionalidade: dashboard global do superadmin
 * Cenário: objetivo concluído na tela real
 * Dado um superadmin autenticado e uma resposta controlada do dashboard
 * Quando acessa o dashboard administrativo
 * Então vê contas vencidas e a limitação do histórico de renovações
 */
test('exibe contas vencidas e limitação de renovações', async ({ page }) => {
  page.on('request', (request) => {
    if (request.url().includes('dashboard')) console.log(`dashboard request: ${request.url()}`);
  });
  await page.route('**/api/admin/dashboard**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          mrrCents: 10000,
          activeClients: 2,
          newClients: 1,
          activeTrials: 1,
          cancellations: 0,
          expiredAccounts: 2,
          renewalActivityCoverage: 'unavailable',
          plans: [],
          recentActivity: [],
        },
      }),
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('token', 'e2e-token');
    localStorage.setItem('user', JSON.stringify({ name: 'Admin QA', email: 'qa@example.test', role: 'superadmin' }));
    localStorage.setItem('fury-theme', 'dark');
  });

  await page.goto('/admin/dashboard');
  await expect(page.getByText('Contas com plano vencido')).toBeVisible();
  await expect(page.getByText('Renovações não estão disponíveis no histórico: nenhum evento confiável foi persistido. Nenhuma renovação foi inferida por alterações de assinatura.')).toBeVisible();
  await expect(page.screenshot({ path: '/tmp/fury-admin-dashboard-real-data.png', fullPage: true })).resolves.toBeTruthy();
});
