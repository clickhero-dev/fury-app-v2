import { expect, test } from '@playwright/test';

const assetId = '22222222-2222-4222-8222-222222222222';
const imageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WAAAAABJRU5ErkJggg==';

test('Estúdio: uma imagem nova gera e exibe as três variações', async ({ page }) => {
  const variationRequests: unknown[] = [];

  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-playwright-session');
    localStorage.setItem('refreshToken', 'isolated-playwright-refresh');
    localStorage.setItem('fury-policy', JSON.stringify({ currentVersion: 'v1', accepted: true }));
    localStorage.setItem('user', JSON.stringify({ name: 'QA local', email: 'qa@example.invalid', role: 'demo', tenantId: 'isolated' }));
  });

  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/studio/ai/models') {
      await route.fulfill({ json: { image: [], video: [] } });
    } else if (path === '/api/studio/assets') {
      await route.fulfill({ json: { assets: [], creativesRemaining: 3, creativesLimit: 10 } });
    } else if (path === '/api/brand-kit/library') {
      await route.fulfill({ json: { success: true, data: [] } });
    } else if (path === '/api/studio/video/jobs') {
      await route.fulfill({ json: { jobs: [] } });
    } else if (path === '/api/studio/ai/enhance-prompt') {
      await route.fulfill({ json: { enhancedPrompt: 'Anúncio de teste com oferta clara e objetiva' } });
    } else if (path === '/api/studio/ai/generate-image') {
      await route.fulfill({ json: { creativeAssetId: assetId, imageUrl } });
    } else if (path === '/api/studio/creative/variations') {
      variationRequests.push(request.postDataJSON());
      await route.fulfill({
        status: 202,
        json: {
          batchId: '33333333-3333-4333-8333-333333333333',
          assetId,
          status: 'succeeded',
          slots: [1, 2, 3].map((index) => ({
            index,
            status: 'succeeded',
            assetId: `44444444-4444-4444-8444-44444444444${index}`,
            imageUrl,
          })),
        },
      });
    } else if (/^\/api\/studio\/assets\/[^/]+\/set-active$/.test(path)) {
      await route.fulfill({ json: { versions: [] } });
    } else if (path === '/api/rbac/blocked-views') {
      await route.fulfill({ json: { data: { blocked: [] } } });
    } else if (path === '/api/notifications') {
      await route.fulfill({ json: { data: { items: [], nextCursor: null, unreadCount: 0 } } });
    } else if (path === '/api/billing/subscription') {
      await route.fulfill({ json: { data: null } });
    } else {
      await route.fulfill({ status: 200, json: { data: {} } });
    }
  });

  await page.goto('/estudio');
  await page.getByRole('button', { name: 'Criação rápida' }).click();
  await page.getByLabel('Descreva o anúncio').fill('Anúncio de teste para gerar variações no Estúdio.');
  await page.getByRole('button', { name: 'Gerar imagem' }).click();

  await expect(page.getByText('Deseja gerar variações deste criativo?')).toBeVisible();
  await page.getByRole('button', { name: 'Sim, gerar variações' }).click();

  await expect(page.getByRole('heading', { name: 'Variações geradas' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Variação \d do criativo/ })).toHaveCount(3);
  expect(variationRequests).toHaveLength(1);
  expect(variationRequests[0]).toMatchObject({ assetId });
});
