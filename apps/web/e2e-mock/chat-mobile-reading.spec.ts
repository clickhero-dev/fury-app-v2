import { expect, test, type Page } from '@playwright/test';

// APIs and image are isolated: no generation, confirmation or paid service is called.
async function openConversation(page: Page, withApprovals = false, empty = false) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-reading');
    localStorage.setItem('user', JSON.stringify({ name: 'QA', role: 'admin', tenantId: 'isolated' }));
    sessionStorage.setItem('ady-chat-current', 'reading');
  });
  await page.route('https://example.test/reading.svg', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#245"/></svg>',
  }));
  await page.route('http://127.0.0.1:3100/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/chat/conversations') return route.fulfill({ json: [{ id: 'reading', title: 'Minha conversa de leitura' }] });
    if (path === '/api/chat/conversations/reading') return route.fulfill({ json: {
      messages: empty ? [] : Array.from({ length: 24 }, (_, index) => ({
        id: `m${index}`, role: index % 2 ? 'assistant' : 'user',
        content: `Mensagem ${index}: texto legível para acompanhar a conversa.\n\nMais detalhes sem espaçamento excessivo.`,
      })),
      approvals: withApprovals ? [
        { id: 'image', action: 'Criar imagem', status: 'completed', parameters: { prompt: 'Uma imagem para minha marca' }, result: { imageUrl: 'https://example.test/reading.svg' } },
        { id: 'pending', action: 'Preparar publicação', status: 'pending', parameters: { caption: 'Conteúdo para revisar antes de confirmar' } },
      ] : [],
    } });
    if (path.endsWith('/plans')) return route.fulfill({ json: { plans: [] } });
    if (path === '/api/notifications') return route.fulfill({ json: { data: { items: [], unreadCount: 1, nextCursor: null } } });
    if (path === '/api/rbac/blocked-views') return route.fulfill({ json: { data: { blocked: [] } } });
    return route.fulfill({ status: 404, json: { error: 'isolated' } });
  });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Somente essenciais' }).click();
  await expect(page.getByRole('button', { name: 'Opções da conversa' })).toBeEnabled();
  if (!empty) await expect(page.locator('.ady-chat-message')).toHaveCount(24);
}

async function readingMetrics(page: Page) {
  return page.locator('.ady-chat').evaluate(root => {
    const height = (selector: string) => root.querySelector(selector)!.getBoundingClientRect().height;
    return {
      header: height('.ady-chat-header'),
      composer: height('.ady-chat-composer-area'),
      messages: height('.ady-chat-messages'),
      viewport: window.visualViewport!.height,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

for (const width of [320, 390, 767]) {
  test(`prioriza leitura mobile sem perder histórico e ações — ${width}x694`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 694 });
    await openConversation(page);
    const metrics = await readingMetrics(page);
    expect(metrics.header).toBeLessThanOrEqual(52);
    expect(metrics.composer).toBeLessThanOrEqual(64);
    expect(metrics.messages).toBeGreaterThanOrEqual(metrics.viewport * .7);
    expect(metrics.overflow).toBe(false);
    await expect(page.locator('.ady-chat-composer-hint')).toBeHidden();
    await expect(page.locator('.ady-chat-header > .ady-chat-avatar')).toBeHidden();
    await expect(page.getByText('Mensagem 23:', { exact: false })).toBeInViewport();
    for (const name of ['Mostrar conversas', 'Opções da conversa', 'Anexar arquivos', 'Gravar mensagem', 'Enviar mensagem']) {
      const button = page.getByRole('button', { name, exact: true });
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const theme = page.getByRole('button', { name: /Ativar modo/ });
    const bell = page.getByRole('button', { name: 'Notificações, 1 não lida', exact: true });
    const themeBox = (await theme.boundingBox())!;
    const bellBox = (await bell.boundingBox())!;
    const optionsBox = (await page.getByRole('button', { name: 'Opções da conversa' }).boundingBox())!;
    const headerBox = (await page.locator('.ady-chat-header').boundingBox())!;
    expect(themeBox.y).toBe(bellBox.y);
    expect(themeBox.x).toBeGreaterThanOrEqual(optionsBox.x + optionsBox.width);
    expect(bellBox.x).toBeGreaterThanOrEqual(themeBox.x + themeBox.width);
    expect(bellBox.y + bellBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height);
    expect(themeBox.width).toBeGreaterThanOrEqual(44);
    expect(bellBox.height).toBeGreaterThanOrEqual(44);
    await bell.click();
    await expect(page.getByRole('dialog', { name: 'Lista de notificações' })).toBeInViewport();
    await page.keyboard.press('Escape');
    const beforeTheme = await theme.getAttribute('aria-label');
    await theme.click();
    await expect(theme).not.toHaveAttribute('aria-label', beforeTheme!);
    expect(await page.locator('.ady-chat-markdown p').last().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: info.outputPath(`reading-${width}.png`) });
    await info.attach('reading-metrics', { body: JSON.stringify(metrics), contentType: 'application/json' });
    await page.getByRole('button', { name: 'Mostrar conversas' }).click();
    await expect(page.getByRole('button', { name: 'Minha conversa de leitura', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ocultar conversas' }).click();
    await expect(page.getByRole('button', { name: 'Mostrar conversas' })).toBeFocused();
    await page.getByRole('button', { name: 'Opções da conversa' }).click();
    await expect(page.getByRole('menuitem', { name: 'Renomear conversa' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Opções da conversa' })).toBeFocused();
  });
}

for (const keyboardHeight of [350, 480]) test(`teclado ${keyboardHeight}px sem perder entrada, leitura antiga ou última mensagem`, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 694 });
  await openConversation(page);
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await input.focus();
  await page.evaluate(height => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => height });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  }, keyboardHeight);
  await expect.poll(async () => (await readingMetrics(page)).messages).toBeGreaterThanOrEqual(keyboardHeight * (keyboardHeight === 480 ? .7 : .6));
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport();
  expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  const composer = (await page.locator('.ady-chat-composer-area').boundingBox())!;
  expect(composer.y + composer.height).toBeLessThanOrEqual(keyboardHeight);
  await expect(page.getByText('Mensagem 23:', { exact: false })).toBeInViewport();
  await info.attach('keyboard-metrics', { body: JSON.stringify(await readingMetrics(page)), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath(`reading-keyboard-${keyboardHeight}.png`) });
  const messages = page.locator('.ady-chat-messages');
  await messages.evaluate(el => { el.scrollTop = 100; });
  await expect(page.getByRole('button', { name: 'Mensagens recentes', exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 694 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => messages.evaluate(el => el.scrollTop)).toBe(100);
  await page.getByRole('button', { name: 'Mensagens recentes', exact: true }).click();
  await expect.poll(() => messages.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath('reading-keyboard-restored.png') });
});

test('paisagem mobile mantém faixa única de controles fora das mensagens', async ({ page }, info) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openConversation(page);
  const metrics = await readingMetrics(page);
  expect(metrics.header).toBeLessThanOrEqual(52);
  expect(metrics.composer).toBeLessThanOrEqual(64);
  expect(metrics.overflow).toBe(false);
  const theme = (await page.getByRole('button', { name: /Ativar modo/ }).boundingBox())!;
  const bell = (await page.getByRole('button', { name: 'Notificações, 1 não lida', exact: true }).boundingBox())!;
  const messages = (await page.locator('.ady-chat-messages').boundingBox())!;
  expect(theme.y).toBe(bell.y);
  expect(bell.y + bell.height).toBeLessThanOrEqual(messages.y);
  await expect(page.getByRole('textbox', { name: 'Mensagem', exact: true })).toBeInViewport();
  await info.attach('landscape-metrics', { body: JSON.stringify(metrics), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('reading-landscape-844.png') });
});

test('cards compactos preservam imagem, status e confirmação explícita', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 694 });
  await openConversation(page, true);
  const imageCard = page.locator('[data-approval-id=image]');
  const pending = page.locator('[data-approval-id=pending]');
  expect(await imageCard.evaluate(el => parseFloat(getComputedStyle(el).paddingTop))).toBeLessThanOrEqual(12);
  expect(await imageCard.locator('dd').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(imageCard.getByText('Status: Concluída')).toBeVisible();
  const image = imageCard.getByRole('img', { name: 'Imagem gerada' });
  await expect(image).toBeVisible();
  expect((await image.boundingBox())!.width).toBeLessThanOrEqual((await imageCard.boundingBox())!.width);
  await pending.getByRole('button', { name: 'Confirmar ação' }).scrollIntoViewIfNeeded();
  await expect(pending.getByRole('button', { name: 'Confirmar ação' })).toBeInViewport();
  expect((await pending.getByRole('button', { name: 'Confirmar ação' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await readingMetrics(page)).overflow).toBe(false);
  await page.screenshot({ path: info.outputPath('reading-cards-320.png') });
});

test('conversa vazia mantém orientação e desktop mantém identidade e dica', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 694 });
  await openConversation(page, false, true);
  await expect(page.getByRole('heading', { name: 'Vamos preparar seu próximo post?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Não sei o que postar', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.ady-chat-header > .ady-chat-avatar')).toBeVisible();
  await expect(page.locator('.ady-chat-header p')).toBeVisible();
  await expect(page.locator('.ady-chat-composer-hint')).toBeVisible();
  expect((await readingMetrics(page)).header).toBeGreaterThanOrEqual(76);
  expect((await readingMetrics(page)).overflow).toBe(false);
});

for (const viewport of [
  { width: 390, height: 694, dark: false },
  { width: 390, height: 694, dark: true },
  { width: 320, height: 568, dark: false },
]) test(`conversa longa e imagem neutra — ${viewport.width}x${viewport.height} ${viewport.dark ? 'dark' : 'light'}`, async ({ page }, info) => {
  await page.setViewportSize(viewport);
  await page.addInitScript(dark => localStorage.setItem('fury-theme', dark ? 'dark' : 'light'), viewport.dark);
  await openConversation(page, true);
  const imageCard = page.locator('[data-approval-id=image]');
  await imageCard.scrollIntoViewIfNeeded();
  await expect(imageCard.getByRole('img', { name: 'Imagem gerada' })).toBeInViewport();
  await expect(imageCard.getByText('Status: Concluída')).toBeInViewport();
  expect((await readingMetrics(page)).overflow).toBe(false);
  const file = `reading-image-${viewport.width}x${viewport.height}-${viewport.dark ? 'dark' : 'light'}.png`;
  await page.screenshot({ path: info.outputPath(file) });
  await info.attach('image-metrics', { body: JSON.stringify(await readingMetrics(page)), contentType: 'application/json' });
});
