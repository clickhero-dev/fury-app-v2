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
});
