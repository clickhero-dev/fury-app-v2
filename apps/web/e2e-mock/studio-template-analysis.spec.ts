import { expect, test } from '@playwright/test';

test('Dada análise inválida, permite corrigir e reenviar manualmente sem perder o modelo', async ({ page }) => {
  const modelId = '11111111-1111-4111-8111-111111111111';
  const message = 'Não foi possível interpretar o modelo. Revise o texto ou escolha outro modelo e tente novamente. Sua cota foi devolvida.';
  const requests: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-playwright-session');
    localStorage.setItem('refreshToken', 'isolated-playwright-refresh');
    localStorage.setItem('fury-policy', JSON.stringify({ currentVersion: 'v1', accepted: true }));
    localStorage.setItem('user', JSON.stringify({ name: 'QA local', email: 'qa@example.invalid', role: 'demo', tenantId: 'isolated' }));
  });
  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/studio/ai/generate-image') {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 502, json: { success: false, error: { code: 'TEMPLATE_ANALYSIS_INVALID', message } } });
    }
    const data: Record<string, unknown> = {
      '/api/studio/ai/models': { image: [], video: [] },
      '/api/studio/assets': { assets: [], creativesRemaining: 3, creativesLimit: 10 },
      '/api/brand-kit/library': { success: true, data: [{ id: modelId, kind: 'modelo', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WAAAAABJRU5ErkJggg==' }] },
      '/api/studio/video/jobs': { jobs: [] },
      '/api/rbac/blocked-views': { data: { blocked: [] } },
      '/api/notifications': { data: { items: [], nextCursor: null, unreadCount: 0 } },
      '/api/billing/subscription': { data: null },
    };
    return route.fulfill({ json: data[path] ?? { data: {} } });
  });
  await page.goto('/estudio');
  await page.getByRole('button', { name: 'Criação rápida' }).click();
  await page.getByRole('button', { name: /usar imagem: modelo/i }).click();
  const original = 'Empresa de exemplo em Joinville';
  await page.getByLabel('O que muda no modelo?').fill(original);
  await page.getByRole('button', { name: 'Gerar imagem' }).click();
  await expect(page.getByText(message)).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByLabel('O que muda no modelo?')).toHaveValue(original);
  await expect(page.getByText('Modelo escolhido')).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.getByLabel('O que muda no modelo?').fill(original + ', oferta de serviços');
  await page.getByRole('button', { name: 'Gerar imagem' }).click();
  await expect(page.getByText(message)).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({ template_photo_id: modelId, prompt: original + ', oferta de serviços' });
});
