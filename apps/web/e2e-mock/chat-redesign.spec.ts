import { expect, test, type Page } from '@playwright/test';

/*
Funcionalidade: conversar em um espaço legível sem obstáculos
Cenário: começar pela mensagem no desktop e no celular, em ambos os temas
Dado que não há conversa selecionada
Quando o usuário escreve e envia uma mensagem
Então uma conversa é criada e a resposta aparece sem atalhos sobrepostos
Cenário: falha ao iniciar uma conversa
Dado que o serviço não consegue criar a conversa
Quando o usuário envia a primeira mensagem
Então o rascunho é preservado e ele pode tentar novamente
Cenário: usar sugestão sem enviar automaticamente
Dado que a tela inicial está aberta
Quando o usuário escolhe criar uma imagem
Então o campo recebe foco e a sugestão, sem enviar dados
Cenário: acessar histórico no celular
Dado que existem conversas anteriores
Quando o usuário abre o histórico e pressiona Escape
Então o painel fecha e o foco volta ao controle
*/

async function isolateChat(page: Page, theme: 'light' | 'dark', failCreation = false) {
  const counts = { creates: 0, sends: 0 };
  let created = false;
  await page.addInitScript(({ theme }) => {
    localStorage.setItem('token', 'isolated-chat-qa');
    localStorage.setItem('refreshToken', 'isolated-chat-qa-refresh');
    localStorage.setItem('fury-theme', theme);
    localStorage.setItem('user', JSON.stringify({ name: 'QA', role: 'admin', tenantId: 'isolated', email: 'qa@example.invalid' }));
    sessionStorage.clear();
  }, { theme });
  await page.route('http://127.0.0.1:3100/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/chat/conversations' && method === 'GET') {
      return route.fulfill({ json: created ? [{ id: 'c1', title: 'Ideias para sua marca' }] : [] });
    }
    if (path === '/api/chat/conversations' && method === 'POST') {
      counts.creates++;
      if (failCreation) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      created = true;
      return route.fulfill({ json: { id: 'c1', title: 'Nova conversa' } });
    }
    if (path === '/api/chat/conversations/c1/messages') {
      counts.sends++;
      return route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ message: { content: '## Um começo para sua marca\n\nVamos transformar sua ideia em conteúdo.\n\n- **Uma imagem** com sua identidade\n- Uma legenda objetiva\n\n| Objetivo | Próximo passo |\n| --- | --- |\n| Apresentar a marca | Escolher uma mensagem |' } })}\n\nevent: title\ndata: {"id":"c1","title":"Ideias para sua marca"}\n\n` });
    }
    if (path === '/api/chat/conversations/c1') return route.fulfill({ json: { id: 'c1', title: 'Ideias para sua marca', messages: [], approvals: [] } });
    if (path === '/api/chat/conversations/c1/plans') return route.fulfill({ json: { plans: [] } });
    if (path === '/api/rbac/blocked-views') return route.fulfill({ json: { data: { blocked: [] } } });
    return route.fulfill({ status: 404, json: { error: 'isolated endpoint' } });
  });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Somente essenciais' }).click();
  return counts;
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'mobile-small', width: 375, height: 812 },
  { name: 'desktop-compact', width: 1280, height: 577 },
  { name: 'mobile-landscape', width: 844, height: 390 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`primeira mensagem sem obstáculos — ${viewport.name} ${theme}`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize(viewport);
      const counts = await isolateChat(page, theme);
      const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
      await expect(input).toBeEnabled();
      await expect(page.getByText('Assistente de IA', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Postar', exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-${theme}-empty.png`), fullPage: true });
      await input.fill('Preciso de ideias para minha marca');
      const send = page.getByRole('button', { name: 'Enviar mensagem', exact: true });
      await expect(send).toBeEnabled();
      await expect(send).toBeInViewport();
      await send.click();
      await expect(page.getByRole('heading', { name: 'Um começo para sua marca' })).toBeVisible();
      await expect(page.getByText('Preciso de ideias para minha marca', { exact: true })).toBeVisible();
      expect(counts).toEqual({ creates: 1, sends: 1 });
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
      await expect(input).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-${theme}-conversation.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}

test('preserva rascunho quando não consegue iniciar a conversa', async ({ page }) => {
  const counts = await isolateChat(page, 'light', true);
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await input.fill('Não perca esta ideia');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/não foi possível/i);
  await expect(input).toHaveValue('Não perca esta ideia');
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeEnabled();
  expect(counts).toEqual({ creates: 1, sends: 0 });
});

test('sugestão preenche e foca o campo sem enviar', async ({ page }) => {
  const counts = await isolateChat(page, 'light');
  await page.getByRole('button', { name: /Criar imagem/i }).click();
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(/imagem/i);
  expect(counts).toEqual({ creates: 0, sends: 0 });
});

test('histórico móvel fecha com Escape e devolve foco', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await isolateChat(page, 'light');
  const trigger = page.getByRole('button', { name: 'Mostrar conversas', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-history.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

/*
Funcionalidade: ler mensagens anteriores sem perder a posição
Cenário: uma nova resposta chega durante a leitura
Dado que o usuário voltou ao começo de uma conversa longa
Quando uma resposta é acrescentada
Então a leitura permanece na mesma posição e um botão permite voltar ao fim
*/
test('preserva leitura antiga e permite voltar à resposta recente', async ({ page }) => {
  await isolateChat(page, 'light');
  await page.route('http://127.0.0.1:3100/api/chat/conversations', route => route.fulfill({ json: [{ id: 'c1', title: 'Leitura longa' }] }));
  await page.route('http://127.0.0.1:3100/api/chat/conversations/c1', route => route.fulfill({ json: {
    id: 'c1', title: 'Leitura longa', approvals: [],
    messages: Array.from({ length: 30 }, (_, index) => ({ id: `m${index}`, role: index % 2 ? 'assistant' : 'user', content: `Trecho ${index}: conteúdo para consultar durante a conversa.` })),
  } }));
  await page.reload();
  await page.getByRole('button', { name: 'Leitura longa', exact: true }).click();
  const messages = page.locator('.ady-chat-messages');
  await expect(page.getByText('Trecho 29:', { exact: false })).toBeVisible();
  await messages.evaluate(element => { element.scrollTop = 0; });
  const latest = page.getByRole('button', { name: 'Mensagens recentes', exact: true });
  await expect(latest).toBeVisible();
  await page.getByRole('textbox', { name: 'Mensagem', exact: true }).fill('Continue com ideias');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Um começo para sua marca' })).toHaveCount(1);
  await expect.poll(() => messages.evaluate(element => element.scrollTop)).toBeLessThan(10);
  await latest.click();
  await expect.poll(() => messages.evaluate(element => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))).toBeLessThan(2);
  await expect(latest).toHaveCount(0);
});

/*
Funcionalidade: mostrar uma conversa familiar sem inventar informações
Cenário: mensagens com e sem horário confirmado
Dado que o servidor informou horários apenas para algumas mensagens
Quando o usuário abre a conversa
Então só essas mensagens mostram horário e as demais continuam legíveis
Cenário: escrever mensagem de várias linhas
Dado que o usuário está no celular
Quando escreve várias linhas
Então o campo cresce até um limite e o envio continua alcançável
*/
test('exibe horários reais e balões distintos sem datas inventadas', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await isolateChat(page, 'light');
  await page.route('http://127.0.0.1:3100/api/chat/conversations', route => route.fulfill({ json: [{ id: 'c1', title: 'Campanha de verão' }] }));
  await page.route('http://127.0.0.1:3100/api/chat/conversations/c1', route => route.fulfill({ json: {
    id: 'c1', title: 'Campanha de verão', approvals: [],
    messages: [
      { id: 'm1', role: 'user', content: 'Quero divulgar meu negócio.', created_at: '2026-11-09T14:30:00Z' },
      { id: 'm2', role: 'assistant', content: 'Vamos começar com uma imagem e uma mensagem clara.', created_at: '2026-11-09T14:31:00Z' },
      { id: 'm3', role: 'user', content: 'Mensagem antiga sem metadados.' },
      { id: 'm4', role: 'assistant', content: 'O conteúdo continua legível.', created_at: 'invalid-date' },
    ],
  } }));
  await page.reload();
  await page.getByRole('button', { name: 'Campanha de verão', exact: true }).click();
  const user = page.locator('.ady-chat-message').filter({ hasText: 'Quero divulgar meu negócio.' });
  const assistant = page.locator('.ady-chat-message').filter({ hasText: 'Vamos começar com uma imagem' });
  await expect(user.locator('time')).toHaveAttribute('datetime', '2026-11-09T14:30:00Z');
  await expect(assistant.locator('time')).toHaveAttribute('datetime', '2026-11-09T14:31:00Z');
  await expect(page.locator('.ady-chat-message').filter({ hasText: 'Mensagem antiga sem metadados.' }).locator('time')).toHaveCount(0);
  await expect(page.locator('.ady-chat-message').filter({ hasText: 'O conteúdo continua legível.' }).locator('time')).toHaveCount(0);
  await expect(page.getByText('Invalid Date', { exact: true })).toHaveCount(0);
  const userStyle = await user.evaluate(element => ({ color: getComputedStyle(element).backgroundColor, x: element.getBoundingClientRect().x }));
  const assistantStyle = await assistant.evaluate(element => ({ color: getComputedStyle(element).backgroundColor, x: element.getBoundingClientRect().x }));
  expect(userStyle.x).toBeGreaterThan(assistantStyle.x);
  expect(userStyle.color).not.toBe(assistantStyle.color);
  expect(assistantStyle.color).not.toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({ path: testInfo.outputPath('messenger-history-light.png'), fullPage: true });
});

test('campo cresce sem esconder envio no celular', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const counts = await isolateChat(page, 'light');
  const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
  const initial = await input.evaluate(element => element.getBoundingClientRect().height);
  await input.fill(Array.from({ length: 15 }, (_, index) => `Detalhe ${index} da minha ideia`).join('\n'));
  const expanded = await input.evaluate(element => ({ height: element.getBoundingClientRect().height, client: element.clientHeight, scroll: element.scrollHeight, resize: getComputedStyle(element).resize }));
  expect(expanded.height).toBeGreaterThan(initial);
  expect(expanded.scroll).toBeGreaterThan(expanded.client);
  expect(expanded.resize).toBe('none');
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeInViewport();
  await input.fill('');
  const cleared = await input.evaluate(element => element.getBoundingClientRect().height);
  expect(cleared).toBeLessThan(expanded.height);
  expect(cleared).toBeGreaterThanOrEqual(44);
  expect(counts).toEqual({ creates: 0, sends: 0 });
});

/*
Funcionalidade: escrever com foco claro sem contornos duplicados
Cenário: focar a mensagem com clique e teclado
Dado que o campo de mensagem tem um contorno arredondado
Quando o usuário clica no campo ou volta a ele pelo teclado
Então somente o contêiner indica foco, sem retângulo dentro do campo
E o botão de envio mantém seu próprio foco visível
*/
for (const width of [1287, 375]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`foco único arredondado no campo — ${width} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 812 });
      await isolateChat(page, theme);
      const input = page.getByRole('textbox', { name: 'Mensagem', exact: true });
      const shell = page.locator('.ady-chat-input-shell');
      const record = page.getByRole('button', { name: 'Gravar mensagem', exact: true });
      const send = page.getByRole('button', { name: 'Enviar mensagem', exact: true });
      await input.click();
      await expect(input).toBeFocused();
      await expect(input).toHaveCSS('outline-style', 'none');
      await expect(input).toHaveCSS('box-shadow', 'none');
      await expect(shell).not.toHaveCSS('box-shadow', 'none');
      await expect(shell).toHaveCSS('border-radius', '24px');
      await input.fill('Uma ideia para minha marca');
      await page.keyboard.press('Tab');
      await expect(record).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(send).toBeFocused();
      await expect(send).toHaveCSS('outline-style', 'solid');
      await expect(shell).toHaveCSS('box-shadow', 'none');
      await page.keyboard.press('Shift+Tab');
      await expect(record).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(input).toBeFocused();
      await expect(input).toHaveCSS('outline-style', 'none');
      await expect(shell).not.toHaveCSS('box-shadow', 'none');
      await page.screenshot({ path: testInfo.outputPath(`composer-focus-${width}-${theme}.png`), fullPage: true });
      await page.emulateMedia({ forcedColors: 'active' });
      await expect(shell).toHaveCSS('outline-style', 'solid');
      await expect(input).toHaveCSS('outline-style', 'none');
    });
  }
}

/*
Funcionalidade: controlar ações da conversa no menu
Cenário: cancelar exclusão
Dado que existe uma conversa selecionada
Quando o usuário escolhe excluir mas cancela a confirmação
Então nenhuma conversa é removida
Cenário: confirmar exclusão
Dado que existe uma conversa selecionada
Quando o usuário confirma sua exclusão
Então somente essa conversa é removida e o campo permanece pronto para começar
*/
test('menu preserva cancelamento e permite confirmar exclusão', async ({ page }) => {
  await isolateChat(page, 'light');
  let deletes = 0;
  await page.route('http://127.0.0.1:3100/api/chat/conversations/c1', async route => {
    if (route.request().method() === 'DELETE') {
      deletes++;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { id: 'c1', title: 'Ideias para sua marca', messages: [], approvals: [] } });
  });
  await page.getByRole('textbox', { name: 'Mensagem', exact: true }).fill('Uma ideia para começar');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ideias para sua marca', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Opções da conversa', exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('menuitem', { name: 'Excluir conversa', exact: true }).click();
  expect(deletes).toBe(0);
  await expect(page.getByRole('button', { name: 'Ideias para sua marca', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Opções da conversa', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('menuitem', { name: 'Excluir conversa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ideias para sua marca', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Mensagem', exact: true })).toBeEnabled();
  expect(deletes).toBe(1);
});

/*
Funcionalidade: navegar no histórico sem títulos sobrepostos
Cenário: muitas conversas com nomes longos em tela baixa
Dado que o histórico tem vinte conversas com títulos extensos
Quando o usuário seleciona uma conversa e percorre a lista
Então o texto fica dentro de cada item e somente o histórico rola
*/
for (const viewport of [{ width: 1287, height: 652 }, { width: 375, height: 812 }]) {
  test(`histórico cheio contém títulos longos sem sobreposição — ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await isolateChat(page, 'dark');
    const conversations = Array.from({ length: 20 }, (_, index) => ({
      id: `c${index}`,
      title: index === 0 ? 'podemos programar postagens organicas para o nosso mes inteiro?' : `Planejamento de conteúdo e dúvidas sobre campanha de divulgação número ${index}`,
    }));
    await page.route('http://127.0.0.1:3100/api/chat/conversations', route => route.fulfill({ json: conversations }));
    await page.route(/http:\/\/127\.0\.0\.1:3100\/api\/chat\/conversations\/c\d+$/, route => route.fulfill({ json: {
      id: 'c0', title: conversations[0].title,
      messages: [{ id: 'm1', role: 'assistant', content: 'Podemos organizar as ideias para suas postagens.' }], approvals: [],
    } }));
    await page.reload();
    if (viewport.width < 700) await page.getByRole('button', { name: 'Mostrar conversas', exact: true }).click();
    await page.getByRole('button', { name: conversations[0].title, exact: true }).click();
    if (viewport.width < 700) await page.getByRole('button', { name: 'Mostrar conversas', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Histórico de conversas', exact: true });
    await expect(nav.getByRole('button')).toHaveCount(20);
    const geometry = await nav.evaluate(element => ({
      client: element.clientHeight, scroll: element.scrollHeight,
      items: Array.from(element.querySelectorAll('button')).map(button => ({
        height: button.clientHeight, scrollHeight: button.scrollHeight,
        width: button.clientWidth, scrollWidth: button.scrollWidth,
        top: button.getBoundingClientRect().top, bottom: button.getBoundingClientRect().bottom,
      })),
    }));
    expect(geometry.scroll).toBeGreaterThan(geometry.client);
    for (const [index, item] of geometry.items.entries()) {
      expect(item.scrollHeight, `texto extrapola altura do item ${index}`).toBeLessThanOrEqual(item.height + 1);
      expect(item.scrollWidth, `texto extrapola largura do item ${index}`).toBeLessThanOrEqual(item.width + 1);
      if (index > 0) expect(item.top).toBeGreaterThanOrEqual(geometry.items[index - 1].bottom);
    }
    await page.screenshot({ path: testInfo.outputPath(`long-history-${viewport.width}.png`), fullPage: true });
    const last = nav.getByRole('button', { name: conversations[19].title, exact: true });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await last.click();
    await expect(page.getByRole('textbox', { name: 'Mensagem', exact: true })).toBeEnabled();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  });
}
