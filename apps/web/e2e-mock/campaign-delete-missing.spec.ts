/*
# Language: pt-BR

Funcionalidade: excluir campanha que já não existe na Meta

  Cenário: uma campanha stale é removida da tabela sem exibir erro técnico
    Dado uma campanha que ainda aparece na lista local
    Quando a exclusão retorna CAMPAIGN_NOT_FOUND
    Então a linha desaparece e a tela permanece utilizável

  Cenário: uma falha de autorização não é tratada como exclusão concluída
    Dado uma campanha que ainda aparece na lista local
    Quando a exclusão retorna FORBIDDEN
    Então a linha permanece e a tela informa o erro de permissão
*/
import { expect, test, type Page } from '@playwright/test';

const staleCampaign = {
  id: 'campaign-stale', name: 'Campanha removida na Meta', status: 'ACTIVE',
  spend: 120, roas: 2.5, cpa: 12, conversions: 10, impressions: 1000, clicks: 40,
};

async function openCampaigns(page: Page, deleteResponse: { status: number; code: string; message: string }) {
  let listRequests = 0;
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-playwright-session');
    localStorage.setItem('refreshToken', 'isolated-playwright-refresh');
    localStorage.setItem('user', JSON.stringify({ name: 'QA local', email: 'qa@example.invalid', role: 'demo', tenantId: 'isolated' }));
    localStorage.setItem('fury-policy', JSON.stringify({ currentVersion: '1.0', accepted: true }));
    document.cookie = `ch_consent=${encodeURIComponent(JSON.stringify({ v: '1', level: 'essential', at: new Date().toISOString() }))}; path=/`;
  });
  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v2/campaigns' && request.method() === 'GET') {
      listRequests += 1;
      await route.fulfill({ json: { success: true, data: listRequests === 1 ? [staleCampaign] : [] } });
      return;
    }
    if (path === '/api/campaigns/campaign-stale' && request.method() === 'DELETE') {
      await route.fulfill({ status: deleteResponse.status, json: { error: { code: deleteResponse.code, message: deleteResponse.message } } });
      return;
    }
    if (path === '/api/announcements/pending') {
      await route.fulfill({ json: { success: true, data: [] } });
      return;
    }
    await route.fulfill({ json: { success: true, data: null } });
  });
  await page.goto('/campanhas');
  await expect(page.getByRole('heading', { name: 'Campanhas' })).toBeVisible();
  await expect(page.getByText(staleCampaign.name)).toBeVisible();
}

test('Cenário: remove da tela a campanha já inexistente na Meta', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openCampaigns(page, { status: 404, code: 'CAMPAIGN_NOT_FOUND', message: 'Campanha não encontrada.' });

  await page.getByRole('button', { name: 'Excluir' }).click();
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

  await expect(page.getByText(staleCampaign.name)).toHaveCount(0);
  await expect(page.getByText('Nenhuma campanha por aqui ainda')).toBeVisible();
  await expect(page.getByText('Campanha não encontrada.')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Cenário: mantém a campanha e mostra erro quando a exclusão é proibida', async ({ page }) => {
  await openCampaigns(page, { status: 403, code: 'FORBIDDEN', message: 'Sem permissão.' });

  await page.getByRole('button', { name: 'Excluir' }).click();
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

  await expect(page.getByText(staleCampaign.name)).toBeVisible();
  await expect(page.getByText('Você não tem permissão para excluir esta campanha.')).toBeVisible();
});
