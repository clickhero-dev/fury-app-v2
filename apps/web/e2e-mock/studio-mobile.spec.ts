import { expect, test, type Page } from '@playwright/test';
const imageUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WAAAAABJRU5ErkJggg==';
const prompt = 'Anúncio de café gelado com promoção de lançamento';
const scenes = [{ start: 0, end: 15, visual: 'Café gelado na mesa', narration: 'Conheça nosso café' }];
const models = [
  { id: 'black-forest-labs/flux.2-pro', description: 'Alta fidelidade', family: 'flux-2', type: 'image' },
  { id: 'other/model', description: 'Realista', family: 'outras', type: 'image' },
];

test.beforeEach(async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-studio');
    localStorage.setItem('refreshToken', 'isolated-studio');
    localStorage.setItem('fury-policy', JSON.stringify({ currentVersion: 'v1', accepted: true }));
    localStorage.setItem('user', JSON.stringify({ name: 'QA local', role: 'demo', tenantId: 'isolated' }));
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.origin === new URL(baseURL!).origin) return route.continue();
    return route.abort();
  });
  await page.route('http://127.0.0.1:3100/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = { data: {} };
    if (path === '/api/studio/assets') json = { assets: [], creativesRemaining: 3, creativesLimit: 10 };
    if (path === '/api/studio/ai/models') json = { image: models, video: [] };
    if (path === '/api/brand-kit/library')
      json = {
        success: true,
        data:
          route.request().method() === 'POST'
            ? [{ id: 'uploaded', kind: 'produto', url: imageUrl }]
            : [
                { id: 'm1', kind: 'modelo', url: imageUrl },
                { id: 'p1', kind: 'produto', url: imageUrl },
              ],
      };
    if (path === '/api/studio/video/jobs')
      json = route.request().method() === 'POST' ? { jobId: 'job1' } : { jobs: [] };
    if (path === '/api/studio/video/jobs/job1')
      json = { jobId: 'job1', status: 'running', stage: 'generating', prompt, createdAt: '2026-11-17T00:00:00Z' };
    if (path === '/api/studio/video/options')
      json = { enabled: true, durations: [15], maxPhotos: 4, videosRemaining: 3, videosLimit: 10 };
    if (path === '/api/studio/video/script') json = { scenes };
    if (path === '/api/studio/ai/enhance-prompt') json = { enhancedPrompt: prompt };
    if (path === '/api/studio/ai/generate-image') json = { creativeAssetId: 'image1', imageUrl };
    if (path === '/api/rbac/blocked-views') json = { data: { blocked: [] } };
    if (path === '/api/notifications') json = { data: { items: [], nextCursor: null, unreadCount: 0 } };
    if (path === '/api/billing/subscription') json = { data: null };
    await route.fulfill({ json });
  });
});
async function open(page: Page, entry: string) {
  await page.goto(entry);
  const cookie = page.getByRole('button', { name: 'Somente essenciais', exact: true });
  if (await cookie.isVisible()) await cookie.click();
  if (!entry.includes('?')) await page.getByRole('button', { name: 'Criação rápida', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Criar imagem', exact: true })).toBeVisible();
}
async function layout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bad = await page.locator('.studio-creation').evaluateAll((roots) =>
    roots
      .flatMap((root) => Array.from(root.querySelectorAll('button,textarea,select,summary')))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.left < 0 || r.right > innerWidth + 1);
      })
      .map((el) => el.textContent),
  );
  expect(bad).toEqual([]);
}
async function touch(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  if (page.viewportSize()!.width < 640) {
    const form = await page.locator('.studio-creation').first().boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(form!.width - 1);
  }
  // A ação deve receber o toque, inclusive com o shell e atalhos reais montados.
  const hit = await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  expect(hit).toBe(true);
}
for (const entry of ['/estudio', '/estudio?criar=rapida']) {
  test(`Dado ${entry}, quando alterna modos e revisa roteiro, então há hierarquia e envio explícito sem geração real`, async ({
    page,
  }, info) => {
    const requests: { path: string; body: unknown }[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST') requests.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() });
    });
    await open(page, entry);
    await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Criar campanha', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Criação rápida', exact: true }).click();
    await expect(page.getByLabel('Descreva o anúncio')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Configurações da imagem' })).toBeVisible();
    await layout(page);
    await touch(page, 'Gerar imagem');
    const isMobile = info.project.name.startsWith('mobile');
    await expect(page.getByRole('button', { name: 'Criar campanha', exact: true })).toBeVisible({ visible: !isMobile });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('imagem.png'), fullPage: true });
    await page.getByText('Referências de imagem', { exact: true }).click();
    await page.getByRole('button', { name: 'Usar imagem: Modelo', exact: true }).click();
    await expect(page.getByLabel('O que muda no modelo?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modelo de imagem' })).toBeHidden();
    await layout(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('imagem-referencias.png'), fullPage: true });
    await page.getByRole('button', { name: 'Vídeo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Criar vídeo', exact: true })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Etapas da criação de vídeo' }).locator('[aria-current="step"]'),
    ).toHaveText(/Descrever/);
    await page.getByLabel('Sobre o que é o vídeo').fill(prompt);
    await layout(page);
    await touch(page, 'Gerar roteiro');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('video.png'), fullPage: true });
    await page.getByText('Fotos de referência', { exact: true }).click();
    await page.getByRole('button', { name: 'Usar imagem: Produto', exact: true }).click();
    await page.getByRole('button', { name: /Horizontal/ }).click();
    await page.getByRole('button', { name: 'Gerar roteiro', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revise o roteiro' })).toBeFocused();
    expect(requests.filter((r) => r.path === '/api/studio/video/jobs')).toHaveLength(0);
    await page.getByLabel('O que aparece').fill('Cena editada com nosso produto');
    await layout(page);
    await touch(page, 'Gerar vídeo');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('video-revisao.png'), fullPage: true });
    await page.getByRole('button', { name: 'Gerar vídeo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Gerando vídeo...' })).toBeVisible();
    expect(requests.find((r) => r.path === '/api/studio/video/jobs')?.body).toEqual({
      prompt,
      photoIds: ['p1'],
      duration: 15,
      aspectRatio: '16:9',
      scenes: [{ ...scenes[0], visual: 'Cena editada com nosso produto' }],
    });
  });
}
test('Dado referências opcionais, quando seleciona e envia foto, então mantém controles e payload de imagem', async ({
  page,
}, info) => {
  await open(page, '/estudio?criar=rapida');
  await page.getByText('Referências de imagem', { exact: true }).click();
  await page.getByRole('button', { name: 'Minhas fotos', exact: true }).click();
  await layout(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Usar imagem: Produto', exact: true }).click();
  await page.getByRole('button', { name: 'Usar fotos', exact: true }).click();
  await page.getByRole('button', { name: 'Remover foto da arte', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar foto', exact: true }).click();
  await page.getByLabel('Enviar como Produto', { exact: true }).setInputFiles({
    name: 'referencia.png',
    mimeType: 'image/png',
    buffer: Buffer.from(imageUrl.split(',')[1], 'base64'),
  });
  await expect(page.getByRole('dialog')).toContainText('Conferir antes de enviar');
  await page.screenshot({ path: info.outputPath('upload.png'), fullPage: false });
  await page.getByRole('button', { name: 'Enviar 1 produto', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByText('Referências de imagem', { exact: true }).click();
  await page.getByRole('button', { name: 'Modelo de imagem', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Realista', exact: true }).click();
  await page.getByRole('button', { name: 'Vertical', exact: true }).click();
  await page.getByLabel('Descreva o anúncio').fill(prompt);
  const request = page.waitForRequest((r) => r.url().endsWith('/studio/ai/generate-image'));
  await page.getByRole('button', { name: 'Gerar imagem', exact: true }).click();
  expect((await request).postDataJSON()).toEqual({
    model: 'other/model',
    prompt,
    aspect_ratio: '9:16',
    photo_ids: ['uploaded'],
  });
});

test('Dado modo escuro e falha no roteiro, quando usa teclado e tenta novamente, então preserva foco, leitura e edição', async ({
  page,
}, info) => {
  await open(page, '/estudio?criar=rapida');
  await page.locator('html').evaluate((el) => el.classList.add('dark'));
  const summary = page.locator('summary').filter({ hasText: 'Referências de imagem' });
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Minhas fotos', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Vídeo', exact: true }).click();
  await page.getByLabel('Sobre o que é o vídeo').fill(prompt);
  await page.route(
    '**/api/studio/video/script',
    async (route) => {
      await route.fulfill({ status: 503, json: { error: { message: 'Roteiro indisponível. Tente novamente.' } } });
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Gerar roteiro', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Roteiro indisponível. Tente novamente.');
  await expect(page.getByLabel('Sobre o que é o vídeo')).toHaveValue(prompt);
  await layout(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('video-erro-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Gerar roteiro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revise o roteiro' })).toBeFocused();
  await page.getByLabel('O que aparece').fill(' ');
  await expect(page.getByRole('button', { name: 'Gerar vídeo', exact: true })).toBeDisabled();
});
