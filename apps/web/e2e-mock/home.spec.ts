/* # language: pt-BR
Funcionalidade: começar pela Home em desktop e mobile
  Cenário: login padrão, Trial e demo abrem a Home, inclusive sem consulta de plano disponível
  Cenário: cada card abre pergunta, sugestões e resposta livre e inicia uma conversa
  Cenário: deep link após login e retorno social conservam a tela pedida
  Cenário: assinatura vencida e autorização continuam bloqueando ferramentas
  Cenário: superadmin preserva sua área separada e Painel mantém as métricas
Todas as APIs são simuladas e o acesso externo é bloqueado; nenhuma ação real é executada.
*/
import { expect, test, type Page } from '@playwright/test';

type Scenario = 'active' | 'trial' | 'demo' | 'missing' | 'error' | 'expired' | 'admin' | 'blocked' | 'context-error';
const cards = [
  { id: 'orientacao', label: 'Não sei por onde começar', question: 'O que você mais precisa para seu negócio agora?', answer: 'Ter ideias do que publicar' },
  { id: 'conteudo', label: 'Criar conteúdo para minhas redes', question: 'O que você quer criar para suas redes?', answer: 'Criar um post com imagem' },
  { id: 'semana', label: 'Planejar minha semana', question: 'Qual é o foco das publicações desta semana?', answer: 'Apresentar Loja de teste para mais pessoas' },
  { id: 'clientes', label: 'Atrair mais clientes', question: 'O que você quer divulgar para atrair clientes?', answer: 'Um produto' },
];

async function mockApp(page: Page, scenario: Scenario = 'active') {
  const writes: { path: string; body: Record<string, unknown> | null }[] = [];
  const user = { name: 'Teste', email: 'test@example.invalid', role: scenario === 'demo' ? 'demo' : 'owner', tenantId: 'test', platformRole: scenario === 'admin' ? 'super_admin' : 'user' };
  const session = { token: 'mock-session', refreshToken: 'mock-refresh', user, policy: { currentVersion: '1', accepted: true } };
  await page.route('http://127.0.0.1:3100/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api', '');
    const method = route.request().method();
    if (method !== 'GET') writes.push({ path, body: route.request().postData() ? route.request().postDataJSON() : null });
    const data = (value: unknown) => route.fulfill({ json: { success: true, data: value } });
    if (['/auth/login', '/auth/demo-login', '/auth/social/handoff', '/public/trial/access'].includes(path)) return data(session);
    if (path === '/billing/subscription') {
      if (scenario === 'error') return route.fulfill({ status: 503, json: { error: 'unavailable' } });
      if (scenario === 'missing') return data(null);
      return data({ status: scenario === 'trial' ? 'trial' : scenario === 'expired' ? 'past_due' : 'active', trialEndsAt: '2100-01-01', currentPeriodEnd: '2100-01-01', plan: { name: 'Plano de teste' } });
    }
    if (path === '/auth/me') return scenario === 'context-error' ? route.fulfill({ status: 503, json: {} }) : data({ ...user, tenantName: 'Loja de teste', audienceDefaults: { city: 'Recife' } });
    if (path === '/meta/connections') return data([]);
    if (path === '/rbac/blocked-views') return data({ blocked: scenario === 'blocked' ? ['studio.image'] : [] });
    if (path === '/policy/current') return data({ currentVersion: '1', accepted: true });
    if (path === '/chat/conversations') return route.fulfill({ json: method === 'POST' ? { id: 'new', title: 'Nova conversa' } : [{ id: 'old', title: 'Conversa anterior' }] });
    if (path === '/chat/conversations/new/messages') return route.fulfill({ contentType: 'text/event-stream', body: 'event: done\ndata: {"message":{"id":"reply","role":"assistant","content":"Vamos escolher o próximo passo. Qual produto você quer apresentar?"}}\n\n' });
    if (path.endsWith('/plans')) return route.fulfill({ json: { plans: [] } });
    if (path === '/v2/dashboard/demo') return data({ demo: false });
    if (path === '/v2/metrics/summary') return data({ summary: { spend: 0, roas: 0, cpa: 0, conversions: 0 } });
    if (path === '/admin/dashboard') return data({ plans: [], recentActivity: [], mrrCents: 0, activeClients: 0, newClients: 0, activeTrials: 0, expiredAccounts: 0, cancellations: 0 });
    if (path.startsWith('/v2/')) return data([]);
    if (method === 'GET') return data([]);
    // An unexpected mutation cannot be silently fulfilled as a real action.
    return route.fulfill({ status: 403, json: { error: 'unexpected mutation in isolated test' } });
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('ady-chat-current', 'old');
    localStorage.setItem('fury-cookie-consent', 'essential');
  });
  return { writes, session };
}

async function dismissCookies(page: Page) {
  const essential = page.getByRole('button', { name: 'Somente essenciais' });
  if (await essential.isVisible()) await essential.click();
}
async function login(page: Page) {
  await page.goto('/login');
  await dismissCookies(page);
  await page.getByLabel('E-mail', { exact: true }).fill('test@example.invalid');
  await page.locator('input[name="password"]').fill('mock-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}
async function expectHome(page: Page) {
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole('heading', { name: 'O que vamos fazer hoje?' })).toBeVisible();
  for (const card of cards) {
    const link = page.getByRole('link', { name: card.label, exact: true });
    await expect(link).toHaveAttribute('href', `/chat?inicio=${card.id}`);
    await expect(link).toBeVisible();
    await expect(link).toHaveAccessibleDescription(/.+/);
  }
  await expect(page.getByRole('button', { name: 'Criar imagem', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const scenario of ['active', 'trial', 'missing', 'error'] as const) {
  test(`login padrão com ${scenario} abre os mesmos quatro cards`, async ({ page }) => {
    await mockApp(page, scenario); await login(page); await expectHome(page);
    if (scenario === 'active') await page.screenshot({ path: test.info().outputPath('home.png'), fullPage: true });
  });
}
test('entrada pública Trial vai à Home', async ({ page }) => {
  const { writes } = await mockApp(page, 'trial');
  await page.goto('/trial/acesso#token=mock-trial');
  await dismissCookies(page); await expectHome(page);
  expect(writes.filter(item => item.path === '/public/trial/access')).toHaveLength(1);
});
test('conta demo vai à Home', async ({ page }) => {
  await mockApp(page, 'demo'); await page.goto('/login'); await dismissCookies(page);
  await page.getByRole('button', { name: /Conhecer o ady com uma conta demo/i }).click();
  await expectHome(page);
});
for (const card of cards) {
  test(`card ${card.id} inicia conversa com contexto sem publicar`, async ({ page, isMobile }) => {
    const { writes } = await mockApp(page); await login(page); await expectHome(page);
    const link = page.getByRole('link', { name: card.label, exact: true });
    if (isMobile) await link.tap();
    else { await link.focus(); await expect(link).toBeFocused(); await page.keyboard.press('Enter'); }
    await expect(page.getByRole('heading', { name: card.label, exact: true })).toBeVisible();
    await expect(page.getByText(card.question, { exact: true })).toBeVisible();
    expect(writes.filter(item => item.path.startsWith('/chat/'))).toHaveLength(0);
    await page.getByRole('button', { name: card.answer, exact: true }).click();
    await expect(page.getByText('Vamos escolher o próximo passo. Qual produto você quer apresentar?', { exact: true })).toBeVisible();
    const sent = writes.filter(item => item.path.endsWith('/messages'));
    expect(sent).toHaveLength(1);
    expect(sent[0].path).toBe('/chat/conversations/new/messages');
    expect(sent[0].body?.content).toContain(card.answer);
    expect(sent[0].body?.content).toContain('Loja de teste');
    expect(sent[0].body?.content).toContain('confirmação explícita');
    expect(writes.map(item => item.path)).toEqual(['/auth/login', '/chat/conversations', '/chat/conversations/new/messages']);
  });
}
test('contexto indisponível mantém resposta livre e caminho útil', async ({ page }) => {
  const { writes } = await mockApp(page, 'context-error'); await login(page);
  await page.getByRole('link', { name: 'Planejar minha semana', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apresentar meu negócio para mais pessoas' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Mensagem' }).fill('Preciso de ideias para minha primeira semana');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(page.getByText('Vamos escolher o próximo passo. Qual produto você quer apresentar?', { exact: true })).toBeVisible();
  const content = writes.find(item => item.path.endsWith('/messages'))?.body?.content;
  expect(content).toContain('Preciso de ideias para minha primeira semana');
  expect(content).not.toContain('Loja de teste');
});
test('deep link mantém destino, query e fragmento após login', async ({ page }) => {
  await mockApp(page); await page.goto('/chat?inicio=conteudo#criar');
  await expect(page).toHaveURL(/\/login$/); await dismissCookies(page);
  await page.getByLabel('E-mail', { exact: true }).fill('test@example.invalid');
  await page.locator('input[name="password"]').fill('mock-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/chat\?inicio=conteudo#criar$/);
  await expect(page.getByRole('heading', { name: 'Criar conteúdo para minhas redes' })).toBeVisible();
});
test('retorno Google conserva deep link em vez do padrão', async ({ page }) => {
  const { session } = await mockApp(page);
  await page.goto('/chat?inicio=semana'); await expect(page).toHaveURL(/\/login$/);
  await page.goto(`/login?social_login=${encodeURIComponent(JSON.stringify(session))}`);
  await dismissCookies(page);
  await expect(page).toHaveURL(/\/chat\?inicio=semana$/);
  await expect(page.getByRole('heading', { name: 'Planejar minha semana' })).toBeVisible();
});
test('retorno Facebook conserva deep link e troca handoff uma vez', async ({ page }) => {
  const { writes } = await mockApp(page);
  await page.goto('/chat?inicio=clientes'); await expect(page).toHaveURL(/\/login$/);
  await page.goto('/login?fb_handoff=mock-handoff'); await dismissCookies(page);
  await expect(page).toHaveURL(/\/chat\?inicio=clientes$/);
  await expect(page.getByRole('heading', { name: 'Atrair mais clientes' })).toBeVisible();
  expect(writes.filter(item => item.path === '/auth/social/handoff')).toHaveLength(1);
});
test('visitante não vê Home sem autenticar', async ({ page }) => {
  await mockApp(page); await page.goto('/inicio'); await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'O que vamos fazer hoje?' })).toHaveCount(0);
});
test('assinatura vencida mantém bloqueio', async ({ page }) => {
  await mockApp(page, 'expired'); await login(page);
  await expect(page).toHaveURL(/\/assinatura-vencida$/);
  await expect(page.getByRole('heading', { name: 'O que vamos fazer hoje?' })).toHaveCount(0);
});
test('superadmin mantém destino separado', async ({ page }) => {
  await mockApp(page, 'admin'); await login(page);
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'O que vamos fazer hoje?' })).toHaveCount(0);
});
test('permissão bloqueada continua impedindo ferramenta', async ({ page }) => {
  await mockApp(page, 'blocked'); await login(page); await expectHome(page);
  await page.goto('/estudio/imagem');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
test('Painel continua acessível pelo menu com métricas', async ({ page, isMobile }) => {
  await mockApp(page); await login(page); await expectHome(page);
  if (isMobile) await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('link', { name: 'Painel', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Painel', exact: true })).toBeVisible();
  await expect(page.getByText('Investimento total', { exact: true })).toBeVisible();
  await expect(page.getByText('Clientes alcançados', { exact: true })).toBeVisible();
  await expect(page.getByText('Custo por cliente', { exact: true })).toBeVisible();
});
