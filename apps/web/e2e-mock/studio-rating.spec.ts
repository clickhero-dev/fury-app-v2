import { expect, test } from '@playwright/test';

const assetId = '22222222-2222-4222-8222-222222222222';
const imageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WAAAAABJRU5ErkJggg==';

test('Dado falha ao avaliar, quando tenta novamente, então envia a mesma nota com sucesso', async ({ page }) => {
  const ratingRequests: unknown[] = [];

  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-playwright-session');
    localStorage.setItem('refreshToken', 'isolated-playwright-refresh');
    localStorage.setItem('fury-policy', JSON.stringify({ currentVersion: 'v1', accepted: true }));
    localStorage.setItem('user', JSON.stringify({ name: 'QA local', email: 'qa@example.invalid', role: 'demo', tenantId: 'isolated' }));
  });

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.hostname === '127.0.0.1') await route.continue();
    else await route.abort();
  });

  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/rating')) {
      expect(request.method()).toBe('PUT');
      expect(path).toBe(`/api/studio/assets/${assetId}/rating`);
      ratingRequests.push(request.postDataJSON());
      await route.fulfill(ratingRequests.length === 1
        ? { status: 500, json: { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' } } }
        : { json: { creativeAssetId: assetId, rating: 4, createdAt: '2026-11-17T00:00:00Z', updatedAt: '2026-11-17T00:00:00Z' } });
    } else if (path === '/api/studio/ai/models') {
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

  const prompt = page.getByLabel('Avaliação do criativo');
  await expect(prompt).toBeVisible({ timeout: 12_000 });
  const fourStars = prompt.getByRole('radio', { name: '4 estrelas' });
  await fourStars.locator('..').click();
  await prompt.getByRole('button', { name: 'Enviar avaliação' }).click();
  await expect(prompt.getByRole('alert')).toHaveText('Não foi possível enviar sua avaliação. Tente novamente.');
  await expect(fourStars).toBeChecked();
  await prompt.getByRole('button', { name: 'Enviar avaliação' }).click();
  await expect(prompt).toBeHidden();
  expect(ratingRequests).toEqual([{ rating: 4 }, { rating: 4 }]);
});
