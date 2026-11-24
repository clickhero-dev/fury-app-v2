import { test, expect } from '@playwright/test';
for (const theme of ['light', 'dark']) {
  test(`Dado diálogo real, gerar legenda de imagem/vídeo, editar e agendar (${theme})`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const requests: Array<{ path: string; body: any }> = []; let fail = false;
    await page.addInitScript((theme) => {
      localStorage.setItem('token', 'isolated-playwright-session');
      localStorage.setItem('user', JSON.stringify({ name: 'QA local', email: 'qa@example.invalid', role: 'demo', tenantId: 'isolated' }));
      localStorage.setItem('fury-theme', theme);
      document.cookie = `ch_consent=${encodeURIComponent(JSON.stringify({ v: '1', level: 'essential', at: new Date().toISOString() }))}; path=/`;
    }, theme);
    await page.route('http://127.0.0.1:3100/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== 'GET') requests.push({ path, body: route.request().postDataJSON() });
      if (path.endsWith('/suggest-caption')) return route.fulfill(fail ? { status: 422, json: { error: { code: 'CAPTION_VIDEO_NO_SPEECH', message: 'No speech' } } } : { json: { success: true, data: { caption: 'Uma legenda contextual para editar', imageUsed: true } } });
      if (path.endsWith('/studio/assets')) return route.fulfill({ json: { assets: [{ id: 'a1', type: 'image', url: 'https://media.example.com/a.png', name: 'Imagem própria' }, { id: 'v1', type: 'video', url: 'https://media.example.com/v.mp4', name: 'Vídeo próprio' }] } });
      if (path.endsWith('/calendar')) return route.fulfill({ json: { data: { posts: [] } } });
      if (path.endsWith('/blocked-views')) return route.fulfill({ json: { data: { blocked: [] } } });
      if (path.endsWith('/notifications')) return route.fulfill({ json: { data: { items: [], unreadCount: 0 } } });
      return route.fulfill({ json: { success: true, data: {} } });
    });
    await page.route('https://media.example.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WAAAAABJRU5ErkJggg==', 'base64') }));
    await page.goto('/calendario?criar=post');
    await page.getByText('Agendar', { exact: true }).click();
    await page.getByRole('button', { name: 'Biblioteca do Estúdio' }).click();
    await page.getByAltText('Imagem própria').click();
    await page.getByRole('button', { name: 'Gerar legenda automática' }).click();
    await expect(page.getByPlaceholder('Escreva a legenda do post...')).toHaveValue('Uma legenda contextual para editar');
    expect(requests.filter(r => r.path.endsWith('/suggest-caption'))[0].body).toEqual({ imageUrl: 'https://media.example.com/a.png' });
    expect(requests).toHaveLength(1);
    await page.getByPlaceholder('Escreva a legenda do post...').fill('Legenda editada pelo usuário');
    await page.locator('input[type=date]').fill('2099-03-10'); await page.locator('input[type=time]').fill('14:30');
    await page.screenshot({ path: `/tmp/fury-caption-e2e/caption-${theme}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Criar post', exact: true }).click();
    await expect.poll(() => requests.find(r => r.path === '/api/planner/posts')?.body.caption).toBe('Legenda editada pelo usuário');
    await page.goto('/calendario?criar=post');
    await page.getByText('Agendar', { exact: true }).click();
    await page.getByRole('button', { name: 'Reels', exact: true }).click();
    await page.getByRole('button', { name: 'Biblioteca do Estúdio' }).click();
    await page.getByLabel('Vídeo próprio').first().click();
    fail = true;
    await page.getByRole('button', { name: 'Gerar legenda automática' }).click();
    await expect(page.getByRole('alert')).toContainText('Não foi identificada fala no vídeo');
    expect(requests.filter(r => r.path.endsWith('/suggest-caption')).at(-1)?.body).toEqual({ videoUrl: 'https://media.example.com/v.mp4' });
    await page.getByPlaceholder('Escreva a legenda do post...').fill('Posso escrever manualmente');
    expect(errors).toEqual([]);
  });
}

test('503 na sugestão preserva legenda e permite agendamento manual', async ({ page }) => {
  let suggestions = 0;
  let submitted: any;
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-playwright-session');
    localStorage.setItem('user', JSON.stringify({ name: 'QA local', email: 'qa@example.invalid', role: 'demo', tenantId: 'isolated' }));
    document.cookie = `ch_consent=${encodeURIComponent(JSON.stringify({ v: '1', level: 'essential', at: new Date().toISOString() }))}; path=/`;
  });
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/suggest-caption')) {
      suggestions++;
      return route.fulfill({ status: 503, json: { error: { code: 'CAPTION_SUGGESTION_UNAVAILABLE', message: 'Serviço temporariamente indisponível' } } });
    }
    if (path === '/api/planner/posts' && route.request().method() === 'POST') submitted = route.request().postDataJSON();
    if (path.endsWith('/studio/assets')) return route.fulfill({ json: { assets: [{ id: 'a1', type: 'image', url: 'https://media.example.com/a.png', name: 'Imagem própria' }] } });
    if (path.endsWith('/calendar')) return route.fulfill({ json: { data: { posts: [] } } });
    if (path.endsWith('/blocked-views')) return route.fulfill({ json: { data: { blocked: [] } } });
    if (path.endsWith('/notifications')) return route.fulfill({ json: { data: { items: [], unreadCount: 0 } } });
    return route.fulfill({ json: { success: true, data: {} } });
  });
  await page.route('https://media.example.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WAAAAABJRU5ErkJggg==', 'base64') }));
  await page.goto('/calendario?criar=post');
  await page.getByText('Agendar', { exact: true }).click();
  await page.getByRole('button', { name: 'Biblioteca do Estúdio' }).click();
  await page.getByAltText('Imagem própria').click();
  const caption = page.getByPlaceholder('Escreva a legenda do post...');
  await caption.fill('Legenda escrita antes da falha');
  await page.getByRole('button', { name: 'Gerar legenda automática' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(caption).toHaveValue('Legenda escrita antes da falha');
  expect(suggestions).toBe(1);
  await page.locator('input[type=date]').fill('2099-03-10');
  await page.locator('input[type=time]').fill('14:30');
  await page.getByRole('button', { name: 'Criar post', exact: true }).click();
  await expect.poll(() => submitted?.caption).toBe('Legenda escrita antes da falha');
});

test('503 no texto da campanha preserva conteúdo manual e permite continuar', async ({ page }) => {
  let suggestions = 0;
  const requests: Array<{ path: string; body: any }> = [];
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-playwright-session');
    localStorage.setItem('user', JSON.stringify({ name: 'QA local', email: 'qa@example.invalid', role: 'demo', tenantId: 'isolated' }));
    document.cookie = `ch_consent=${encodeURIComponent(JSON.stringify({ v: '1', level: 'essential', at: new Date().toISOString() }))}; path=/`;
  });
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') requests.push({ path, body: route.request().postDataJSON() });
    if (path.endsWith('/suggest-text')) {
      suggestions++;
      return route.fulfill({
        status: 503,
        headers: { 'x-request-id': 'e2e-suggestion-503' },
        json: { error: { code: 'AD_COPY_SUGGESTION_UNAVAILABLE', message: 'Serviço temporariamente indisponível', requestId: 'e2e-suggestion-503' } },
      });
    }
    if (path.endsWith('/studio/assets')) {
      return route.fulfill({ json: { assets: [{ id: 'asset-1', type: 'image', url: 'https://media.example.com/campaign.png', name: 'Criativo de campanha' }] } });
    }
    if (path.endsWith('/meta/asset-selection')) {
      return route.fulfill({ json: { success: true, data: { pages: [{ pageId: 'page-1', name: 'Página de teste', hasInstagram: true, instagramUserId: 'ig-1', instagramUsername: 'teste', hasWhatsApp: false }], adAccounts: [], whatsappNumbers: [], businesses: [] } } });
    }
    if (path.endsWith('/instagram/posts-ranked')) return route.fulfill({ json: { success: true, data: [] } });
    return route.fulfill({ json: { success: true, data: {} } });
  });
  await page.route('https://media.example.com/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7WAAAAABJRU5ErkJggg==', 'base64') }));

  await page.goto('/criar-campanha');
  await page.getByRole('button', { name: /Aumentar Seguidores do Instagram/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Galeria' }).click();
  await page.getByTestId('wizard-gallery-asset').click();
  const headline = page.getByPlaceholder('Ex: Promoção imperdível este mês!');
  const primaryText = page.getByPlaceholder('Descreva sua oferta de forma clara e atrativa.');
  await headline.fill('Título escrito manualmente');
  await primaryText.fill('Texto escrito manualmente antes da falha');
  await page.getByRole('button', { name: 'Sugestão IA' }).click();

  await expect(page.getByText('Não foi possível gerar sugestões agora. Tente novamente ou continue escrevendo manualmente.')).toBeVisible();
  await expect(headline).toHaveValue('Título escrito manualmente');
  await expect(primaryText).toHaveValue('Texto escrito manualmente antes da falha');
  expect(suggestions).toBe(1);
  expect(requests.filter(request => request.path.endsWith('/suggest-text'))).toHaveLength(1);
  expect(requests.find(request => request.path.endsWith('/suggest-text'))?.body).toEqual({ imageUrl: 'https://media.example.com/campaign.png' });

  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Público' })).toBeVisible();
});
