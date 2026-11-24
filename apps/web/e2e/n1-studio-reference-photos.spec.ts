import { expect, test } from '@playwright/test';

for (const fallback of [false, true]) {
test(`envia fotos e respeita o texto escolhido (fallback: ${fallback})`, async ({ page }) => {
  const teamPhoto = {
    id: '11111111-1111-1111-1111-111111111111',
    kind: 'equipe',
    url: 'https://cdn.example.test/equipe.jpg',
    created_at: '2026-11-06T00:00:00.000Z',
  };
  const productPhoto = {
    id: '22222222-2222-2222-2222-222222222222',
    kind: 'produto',
    url: 'https://cdn.example.test/produto.jpg',
    created_at: '2026-11-06T00:00:00.000Z',
  };
  let enhancePayload: unknown;
  let generationPayload: unknown;

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
  await page.route('**/brand-kit/library', async (route) => {
    await route.fulfill({ json: { success: true, data: [teamPhoto, productPhoto] } });
  });
  await page.route('**/studio/ai/enhance-prompt', async (route) => {
    enhancePayload = route.request().postDataJSON();
    if (fallback) await route.fulfill({ status: 500, json: { error: 'indisponível' } });
    else await route.fulfill({ json: { enhancedPrompt: 'Retrato profissional usando as fotos selecionadas.' } });
  });
  await page.route('**/studio/ai/generate-image', async (route) => {
    generationPayload = route.request().postDataJSON();
    await route.fulfill({ json: { creativeAssetId: 'e2e-asset', imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP', modificationsRemaining: 9 } });
  });

  await page.goto('/estudio?criar=rapida');
  await page.getByRole('button', { name: 'Minhas fotos' }).click();
  const picker = page.getByRole('dialog', { name: 'Fotos para colocar na arte' });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'Usar imagem: Equipe' }).click();
  await picker.getByRole('button', { name: 'Usar imagem: Produto' }).click();
  await picker.getByRole('button', { name: 'Usar fotos' }).click();

  await page.getByLabel('Descreva o anúncio').fill('Retrato profissional para divulgar atendimento de terapia.');
  if (fallback) {
    await page.getByLabel('Sem texto', { exact: true }).check();
  } else {
    await page.getByLabel('Escrever uma frase').check();
    await expect(page.getByRole('button', { name: 'Gerar imagem' })).toBeDisabled();
    await page.getByLabel('Frase na imagem').fill('Terapia de Dianética');
  }
  await expect(page.getByText(/Confira se a pessoa gerada/)).toBeVisible();
  await page.getByRole('button', { name: 'Gerar imagem' }).click();
  await expect(page.getByRole('heading', { name: 'Seu anúncio' })).toBeVisible();

  expect(enhancePayload).toEqual(expect.objectContaining({
    photo_kinds: ['equipe', 'produto'],
  }));
  expect(generationPayload).toEqual(expect.objectContaining({
    prompt: fallback
      ? 'Retrato profissional para divulgar atendimento de terapia.\nNão escreva nenhum texto na imagem.'
      : 'Retrato profissional usando as fotos selecionadas.\nTexto na imagem (único texto, escrito exatamente assim): "Terapia de Dianética"',
    photo_ids: [teamPhoto.id, productPhoto.id],
  }));
});

}
