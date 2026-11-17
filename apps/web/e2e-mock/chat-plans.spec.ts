import { expect, test, type Page } from '@playwright/test';

/*
Funcionalidade: transformar um pedido em plano executável na conversa
Cenário: revisar, aprovar, pausar e continuar sem perder o progresso
Dado que a Ady propôs um plano de duas etapas
Quando o usuário aprova, pausa e continua
Então a interface acompanha o estado persistido e mostra os resultados confirmados
Cenário: aprovação falha
Dado que o serviço está indisponível
Quando o usuário tenta aprovar
Então o plano continua como rascunho e pode ser tentado novamente sem aprovação fictícia
Cenário: concluir tarefa manual
Dado que uma etapa depende de trabalho fora da Ady
Quando o usuário confirma que a realizou
Então somente essa etapa manual é concluída
APIs e executor são simulados nesta suíte; durabilidade/efeitos são testados no backend.
*/

const cid = '33333333-3333-4333-8333-333333333333';
const pid = '44444444-4444-4444-8444-444444444444';
const tid1 = '55555555-5555-4555-8555-555555555551';
const tid2 = '55555555-5555-4555-8555-555555555552';

function initialPlan(manual = false) {
  return {
    id: pid, conversationId: cid, title: 'Conteúdo da semana', goal: 'Preparar um texto alinhado à marca.',
    status: 'draft', version: 1, createdAt: '2026-11-10T03:00:00Z', updatedAt: '2026-11-10T03:00:00Z',
    tasks: [
      { id: tid1, key: 'marca', title: 'Consultar a marca', capability: 'read_brand', parameters: {}, dependsOn: [], status: 'pending', result: undefined as { summary: string; text?: string } | undefined },
      { id: tid2, key: 'texto', title: manual ? 'Revisar o texto com a equipe' : 'Preparar o texto', capability: manual ? 'manual' : 'draft_text', parameters: manual ? { instructions: 'Revise o texto com sua equipe.' } : { prompt: 'Prepare um texto de apresentação.' }, dependsOn: ['marca'], status: 'pending', result: undefined as { summary: string; text?: string } | undefined },
    ],
  };
}

async function isolatePlans(page: Page, options: { theme?: 'light' | 'dark'; manual?: boolean } = {}) {
  const state = { exists: false, proposed: false, approvalFails: false, plan: initialPlan(options.manual), actions: [] as string[] };
  await page.addInitScript(({ theme }) => {
    localStorage.setItem('token', 'isolated-chat-plans-qa');
    localStorage.setItem('refreshToken', 'isolated-chat-plans-qa-refresh');
    localStorage.setItem('fury-theme', theme);
    localStorage.setItem('user', JSON.stringify({ name: 'QA', role: 'admin', tenantId: 'isolated', email: 'qa@example.invalid' }));
    sessionStorage.clear();
  }, { theme: options.theme ?? 'light' });
  await page.route('http://127.0.0.1:3100/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    const base = `/api/chat/conversations/${cid}`;
    if (pathname === '/api/rbac/blocked-views') return route.fulfill({ json: { data: { blocked: [] } } });
    if (pathname === '/api/chat/conversations' && method === 'POST') {
      state.exists = true;
      return route.fulfill({ status: 201, json: { id: cid, title: 'Planejamento da semana' } });
    }
    if (pathname === '/api/chat/conversations') return route.fulfill({ json: state.exists ? [{ id: cid, title: 'Planejamento da semana' }] : [] });
    if (pathname === `${base}/messages`) {
      state.proposed = true;
      return route.fulfill({ contentType: 'text/event-stream', body: 'event: done\ndata: {"message":{"id":"answer","role":"assistant","content":"Preparei o plano para sua revisão. Nada foi executado ainda."}}\n\n' });
    }
    if (pathname === base) return route.fulfill({ json: { id: cid, title: 'Planejamento da semana', messages: state.proposed ? [{ id: 'answer', role: 'assistant', content: 'Preparei o plano para sua revisão. Nada foi executado ainda.' }] : [], approvals: [] } });
    if (pathname === `${base}/plans`) return route.fulfill({ json: { plans: state.proposed ? [state.plan] : [] } });
    if (pathname === `${base}/plans/${pid}` && method === 'GET') return route.fulfill({ json: { plan: state.plan } });
    if (pathname.startsWith(`${base}/plans/${pid}/`) && method === 'POST') {
      const action = pathname.split('/').at(-1)!;
      const body = request.postDataJSON();
      state.actions.push(action);
      expect(body.version).toBe(state.plan.version);
      if (action === 'approve' && state.approvalFails) return route.fulfill({ status: 503, json: { error: 'Não foi possível iniciar o plano. Tente novamente.' } });
      state.plan.version++;
      if (action === 'approve') {
        state.plan.status = options.manual ? 'waiting_approval' : 'running';
        state.plan.tasks[0].status = 'completed';
        state.plan.tasks[0].result = { summary: 'Informações da marca consultadas.' };
        if (options.manual) state.plan.tasks[1].status = 'waiting_approval';
      } else if (action === 'pause') state.plan.status = 'paused';
      else if (action === 'resume') state.plan.status = 'running';
      else if (action === 'cancel') state.plan.status = 'cancelled';
      else if (action === 'complete') {
        expect(pathname).toContain(`/tasks/${tid2}/`);
        expect(state.plan.tasks[1].capability).toBe('manual');
        state.plan.tasks[1].status = 'completed';
        state.plan.tasks[1].result = { summary: 'Revisão confirmada pelo usuário.' };
        state.plan.status = 'completed';
      } else return route.fulfill({ status: 404, json: { error: 'isolated action' } });
      return route.fulfill({ json: { plan: state.plan } });
    }
    return route.fulfill({ status: 404, json: { error: 'isolated endpoint' } });
  });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Somente essenciais' }).click();
  await page.getByRole('textbox', { name: 'Mensagem', exact: true }).fill('Crie um plano para preparar as publicações da semana.');
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conteúdo da semana', exact: true })).toBeVisible();
  expect(state.actions).toEqual([]);
  return state;
}

for (const theme of ['light', 'dark'] as const) {
  test(`plano exige aprovação, pausa e retoma com progresso persistido — ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const state = await isolatePlans(page, { theme });
    await expect(page.getByText('Consultar a marca', { exact: true })).toBeVisible();
    await expect(page.getByText('Preparar o texto', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`plan-${theme}-draft.png`), fullPage: true });
    await page.getByRole('button', { name: 'Aprovar e executar', exact: true }).click();
    await expect(page.getByText('Informações da marca consultadas.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pausar plano', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continuar plano', exact: true })).toBeEnabled();
    await page.reload();
    await page.getByRole('button', { name: 'Mostrar conversas', exact: true }).click();
    await page.getByRole('button', { name: 'Planejamento da semana', exact: true }).click();
    await expect(page.getByText('Informações da marca consultadas.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continuar plano', exact: true }).click();
    expect(state.actions).toEqual(['approve', 'pause', 'resume']);
    state.plan.tasks[1].status = 'completed';
    state.plan.tasks[1].result = { summary: 'Texto preparado.', text: 'Conheça uma marca feita para você.' };
    state.plan.status = 'completed';
    state.plan.version++;
    await expect(page.getByText('Conheça uma marca feita para você.', { exact: true })).toBeVisible({ timeout: 12000 });
    await expect(page.getByRole('button', { name: 'Pausar plano', exact: true })).toHaveCount(0);
    expect(state.actions.filter(action => action === 'approve')).toHaveLength(1);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    await page.screenshot({ path: testInfo.outputPath(`plan-${theme}-completed.png`), fullPage: true });
  });
}

test('falha ao aprovar não declara execução e permite tentar novamente', async ({ page }) => {
  const state = await isolatePlans(page);
  state.approvalFails = true;
  await page.getByRole('button', { name: 'Aprovar e executar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/não foi possível|tente novamente/i);
  await expect(page.getByRole('button', { name: 'Aprovar e executar', exact: true })).toBeEnabled();
  expect(state.plan.status).toBe('draft');
  await expect(page.getByText('Informações da marca consultadas.', { exact: true })).toHaveCount(0);
  state.approvalFails = false;
  await page.getByRole('button', { name: 'Aprovar e executar', exact: true }).click();
  await expect(page.getByText('Informações da marca consultadas.', { exact: true })).toBeVisible();
  expect(state.plan.status).toBe('running');
});

test('confirmação manual só conclui tarefa realmente manual', async ({ page }) => {
  const state = await isolatePlans(page, { manual: true });
  await page.getByRole('button', { name: 'Aprovar e executar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Concluir tarefa Consultar a marca', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Concluir tarefa Revisar o texto com a equipe', exact: true }).click();
  await expect(page.getByText('Revisão confirmada pelo usuário.', { exact: true })).toBeVisible();
  expect(state.actions).toEqual(['approve', 'complete']);
});
