import { expect, test } from '@playwright/test';

/*
 * Funcionalidade: progresso visual da criação rápida
 * Cenário: acompanhar a geração de imagem
 * Dado que o usuário está na criação rápida do Estúdio
 * Quando inicia uma geração que demora alguns instantes
 * Então vê uma barra estimada e o resultado só aparece após a conclusão visual
 */
test('mostra progresso estimado e conclui antes de exibir o resultado', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'e2e-local-token'));
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({ json: { id: 'e2e-user', email: 'e2e@example.test', tenantId: 'e2e-tenant' } });
  });
  await page.route('**/studio/ai/models', async (route) => {
    await route.fulfill({ json: { image: [{ id: 'flux-test', name: 'Modelo de teste', provider: 'test' }], video: [] } });
  });
  await page.route('**/studio/assets', async (route) => {
    await route.fulfill({ json: { assets: [], creativesRemaining: 10, creativesLimit: 20 } });
  });
  await page.route('**/studio/ai/enhance-prompt', async (route) => {
    await route.fulfill({ json: { enhancedPrompt: 'Imagem de teste para validar a barra de progresso.' } });
  });
  await page.route('**/studio/ai/generate-image', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({ json: { creativeAssetId: 'e2e-asset', imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP', modificationsRemaining: 9 } });
  });
  await page.route('**/studio/creative/variations', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        batchId: body.batchId,
        assetId: body.assetId,
        status: 'succeeded',
        slots: [0, 1, 2].map((index) => ({
          index,
          status: 'succeeded',
          assetId: `e2e-variation-${index}`,
          imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP',
        })),
      },
    });
  });
  await page.goto('/estudio?criar=rapida');
  await expect(page.getByRole('heading', { name: 'Criação rápida' })).toBeVisible();
  await page.getByLabel('Descreva o anúncio').fill('Imagem de teste com produto em destaque e fundo claro.');
  await page.getByRole('button', { name: 'Gerar imagem' }).click();

  const progress = page.getByRole('progressbar', { name: 'Progresso estimado da geração da imagem' });
  await expect(progress).toBeVisible();
  await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  await expect(progress).toHaveAttribute('aria-valuenow', '100', { timeout: 3_000 });
  await page.screenshot({ path: 'test-results/n5-progress-100.png', fullPage: true });
  await expect(page.getByRole('heading', { name: 'Seu anúncio' })).toBeVisible();
  await page.screenshot({ path: 'test-results/n5-progress-result.png', fullPage: true });

  await page.getByRole('button', { name: /sim, gerar variações/i }).click();
  await expect(page.getByRole('heading', { name: 'Variações geradas' })).toBeVisible();
  await expect(page.getByAltText('Variação 1 do criativo')).toBeVisible();
});

/*
 * Funcionalidade: avaliação de criativo após a geração.
 * Cenário: nota persistida; Dado que a imagem acabou de ser gerada;
 * Quando espero o convite e escolho uma nota; Então a nota é enviada para o asset gerado.
 * Cenário: falha recuperável; Dado que o primeiro envio falha;
 * Quando tento enviar novamente; Então o convite permanece acessível e o novo envio é aceito.
 */
test('solicita e envia avaliação do criativo gerado, permitindo nova tentativa após falha', async ({ page }) => {
  const ratingRequests: Array<{ url: string; rating: number }> = [];
  let shouldFail = true;

  await page.addInitScript(() => localStorage.setItem('token', 'e2e-local-token'));
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({ json: { id: 'e2e-user', email: 'e2e@example.test', tenantId: 'e2e-tenant' } });
  });
  await page.route('**/studio/ai/models', async (route) => {
    await route.fulfill({ json: { image: [{ id: 'flux-test', name: 'Modelo de teste', provider: 'test' }], video: [] } });
  });
  await page.route('**/studio/assets', async (route) => {
    await route.fulfill({ json: { assets: [], creativesRemaining: 10, creativesLimit: 20 } });
  });
  await page.route('**/studio/ai/enhance-prompt', async (route) => {
    await route.fulfill({ json: { enhancedPrompt: 'Imagem de teste para avaliação.' } });
  });
  await page.route('**/studio/ai/generate-image', async (route) => {
    await route.fulfill({ json: { creativeAssetId: 'e2e-asset-rating', imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP', modificationsRemaining: 9 } });
  });
  await page.route('**/studio/assets/e2e-asset-rating/set-active', async (route) => {
    await route.fulfill({ json: { groupId: 'e2e-asset-rating', activeVersionId: 'e2e-asset-rating', archivedAt: null, versions: [] } });
  });
  await page.route('**/studio/assets/e2e-asset-rating/rating', async (route) => {
    ratingRequests.push({ url: route.request().url(), rating: route.request().postDataJSON().rating });
    if (shouldFail) {
      shouldFail = false;
      await route.fulfill({ status: 500, json: { error: 'Falha temporária' } });
      return;
    }
    await route.fulfill({ json: { creativeAssetId: 'e2e-asset-rating', rating: 4, createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z' } });
  });

  await page.goto('/estudio?criar=rapida');
  await page.getByLabel('Descreva o anúncio').fill('Imagem de teste com produto em destaque e fundo claro.');
  await page.getByRole('button', { name: 'Gerar imagem' }).click();
  await expect(page.getByRole('heading', { name: 'Seu anúncio' })).toBeVisible();

  const prompt = page.getByLabel('Avaliação do criativo');
  await expect(prompt).toBeVisible({ timeout: 7_000 });
  const fourStars = prompt.getByRole('radio', { name: '4 estrelas' });
  await fourStars.locator('..').click();
  await expect(fourStars).toBeChecked();
  await prompt.getByRole('button', { name: 'Enviar avaliação' }).click();
  await expect(prompt.getByRole('alert')).toHaveText('Não foi possível enviar sua avaliação. Tente novamente.');

  await prompt.getByRole('button', { name: 'Enviar avaliação' }).click();
  await expect(prompt).toBeHidden();
  expect(ratingRequests.map(({ url, rating }) => ({ path: new URL(url).pathname, rating }))).toEqual([
    { path: '/api/studio/assets/e2e-asset-rating/rating', rating: 4 },
    { path: '/api/studio/assets/e2e-asset-rating/rating', rating: 4 },
  ]);
});
