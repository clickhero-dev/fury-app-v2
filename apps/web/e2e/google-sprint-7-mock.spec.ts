/*
# Language: pt-BR

Funcionalidade: explorar a Sprint 7 Google no modo de demonstração

  Cenário: alternar canais, gerenciar o Perfil Google e simular uma campanha
    Dado que uma pessoa autenticada abre o app com respostas de API isoladas
    Quando alterna dashboard, navega pelas abas do perfil, salva nota e resposta,
      adiciona uma foto local e preenche a campanha Google
    Então cada tela mostra o estado esperado
    E nenhuma chamada de leitura ou escrita Google é enviada
*/
import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const apiCalls: string[] = [];

test.beforeEach(async ({ page }) => {
  apiCalls.length = 0;
  await page.addInitScript(() => {
    localStorage.setItem('token', 'sprint7-e2e-token');
    localStorage.setItem('refreshToken', 'sprint7-e2e-refresh');
    localStorage.setItem('user', JSON.stringify({
      name: 'Sprint 7 Demo',
      email: 'sprint7@example.test',
      role: 'admin',
      tenantId: 'sprint7-demo-tenant',
    }));
    localStorage.setItem('fury-policy', JSON.stringify({ currentVersion: 'e2e', accepted: true }));
    localStorage.setItem('fury-plan-expiration', '2030-01-01T00:00:00.000Z');
    localStorage.setItem('fury-theme', 'dark');
    localStorage.setItem('ady-meta-connected', 'true');
    document.cookie = `ch_consent=${encodeURIComponent(JSON.stringify({ v: '1', level: 'essential', at: new Date().toISOString() }))}; Path=/; SameSite=Lax`;
  });

  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const url = new URL(route.request().url());
    apiCalls.push(`${route.request().method()} ${url.pathname}`);
    let data: unknown = [];
    if (url.pathname.endsWith('/meta/connections')) {
      data = [{ id: 'meta-demo', selectedAdAccountId: 'meta-ad-demo' }];
    } else if (url.pathname.endsWith('/billing/subscription')) {
      data = {
        id: 'subscription-demo',
        status: 'active',
        currentPeriodEnd: '2030-01-01T00:00:00.000Z',
        plan: { name: 'Demo' },
      };
    } else if (url.pathname.endsWith('/v2/metrics/summary')) {
      data = { summary: { spend: 0, roas: 0, cpa: 0, conversions: 0 } };
    } else if (url.pathname.endsWith('/v2/metrics/daily')) {
      data = [];
    } else if (url.pathname.endsWith('/v2/metrics/goals-progress')) {
      data = null;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data }),
    });
  });
});

test('jornada Sprint 7: dashboard, Perfil Google e campanha com mocks locais', async ({ page }, testInfo) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
  await page.getByRole('button', { name: 'Google' }).click();
  await expect(page.getByText('18.420')).toBeVisible();
  await expect(page.getByText('Campanhas Google')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('dashboard-google.png'), fullPage: true });
  await page.getByRole('button', { name: 'Meta' }).click();

  await page.goto('/configuracoes/google-meu-negocio');
  await expect(page.getByRole('heading', { name: 'Padaria Modelo' })).toBeVisible();
  await page.getByRole('tab', { name: 'Avaliações' }).click();
  const review = page.getByTestId('review-review-2');
  await review.getByRole('textbox', { name: 'Nota interna (só para sua equipe)' }).fill('Acompanhar tempo de espera.');
  await review.getByRole('button', { name: 'Salvar nota interna' }).click();
  await expect(review.getByText('Nota privada salva nesta demonstração')).toBeVisible();
  await review.getByRole('button', { name: 'Responder' }).click();
  await review.getByRole('textbox', { name: 'Resposta pública' }).fill('Obrigado pelo comentário, Rafael!');
  await review.getByRole('button', { name: 'Enviar resposta' }).click();
  await expect(review.getByText('Obrigado pelo comentário, Rafael!')).toBeVisible();
  await expect(review.getByText(/não enviada ao Google/i)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('perfil-google-avaliacoes.png'), fullPage: true });

  await page.getByRole('tab', { name: 'Fotos' }).click();
  await page.getByLabel('Adicionar foto de demonstração').setInputFiles({
    name: 'vitrine.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('mock photo'),
  });
  await expect(page.getByText(/não foi enviada ao Google/i)).toBeVisible();
  await expect(page.getByText('vitrine.jpg', { exact: true })).toBeVisible();

  await page.goto('/campanhas');
  await page.getByRole('button', { name: 'Google' }).click();
  await expect(page.getByText('Padaria perto de você')).toBeVisible();
  await page.getByRole('button', { name: 'Nova campanha' }).click();
  await expect(page.getByRole('heading', { name: 'Criar campanha no Google' })).toBeVisible();
  await page.getByLabel('Título do anúncio 1').fill('Padaria fresquinha perto de você');
  await page.getByLabel('Título do anúncio 2').fill('Pães artesanais todos os dias');
  await page.getByLabel('Título do anúncio 3').fill('Faça seu pedido hoje');
  await page.getByLabel('Título longo').fill('Encontre pães fresquinhos na Padaria Modelo');
  await page.getByLabel('Descrição 1').fill('Pães saindo do forno todos os dias.');
  await page.getByLabel('Descrição 2').fill('Visite nossa loja no seu bairro.');
  await page.getByLabel('Site de destino').fill('https://padaria.example');
  await page.getByLabel('Imagem paisagem (1,91:1)').fill('https://assets.example/paisagem.jpg');
  await page.getByLabel('Imagem quadrada (1:1)').fill('https://assets.example/quadrada.jpg');
  await page.getByRole('button', { name: 'Simular criação' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Campanha pronta para revisão' })).toBeVisible();
  await expect(page.getByText(/não foi publicada no Google/i)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('campanha-google-simulada.png'), fullPage: true });

  expect(apiCalls.some((call) => call.includes('/google'))).toBe(false);
});
