/// <reference types="node" />
import { expect, test, type Page } from '@playwright/test';

/*
Funcionalidade: confirmar uma ação com resultado verdadeiro
Cenário: criação recusada pelas regras do plano
Dado uma proposta de vídeo existente e APIs isoladas
Quando confirmo e o servidor informa uma recusa conhecida
Então leio o motivo, não reenvio e preservo esse motivo ao recarregar
Cenário: resultado desconhecido
Dado uma falha de rede ou erro não classificado
Quando confirmo e reabro a conversa
Então não há nova confirmação automática nem falso resultado definitivo
Cenário: execução aceita
Dado uma proposta válida
Quando confirmo e o servidor aceita o trabalho
Então a interface acompanha o vídeo sem antecipar conclusão
Cenário: cartão confirmado permanece antes das mensagens seguintes
Dado uma confirmação entre a proposta e uma nova pergunta
Quando envio outra mensagem depois de confirmar
Então o cartão permanece no ponto correto da conversa
Estas jornadas validam a UI real com respostas simuladas; não acionam geração ou conta real.
*/

const conversationId = '66666666-6666-4666-8666-666666666661';
const approvalId = '66666666-6666-4666-8666-666666666662';
const planMessage = 'A criação de vídeos não está disponível no seu plano atual.';
const uncertainMessage = 'O resultado não pôde ser confirmado. Verifique o estado da ação antes de tentar novamente.';
type Scenario = 'refused' | 'unknown' | 'network' | 'processing' | 'timeline';

async function isolateConfirmation(page: Page, scenario: Scenario, theme: 'light' | 'dark' = 'light') {
  const state = { confirmations: 0, status: 'pending', result: undefined as Record<string, unknown> | undefined, requests: [] as string[], pageErrors: [] as string[] };
  page.on('pageerror', error => state.pageErrors.push(error.message));
  await page.addInitScript(({ theme }) => {
    localStorage.setItem('token', 'isolated-confirmation-test');
    localStorage.setItem('refreshToken', 'isolated-confirmation-refresh');
    localStorage.setItem('fury-theme', theme);
    localStorage.setItem('user', JSON.stringify({ name: 'QA', role: 'admin', tenantId: 'isolated', email: 'qa@example.invalid' }));
    // Do not clear sessionStorage: uncertainty must survive reload.
  }, { theme });
  await page.route('http://127.0.0.1:3100/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    state.requests.push(`${request.method()} ${pathname}`);
    if (pathname === '/api/rbac/blocked-views') return route.fulfill({ json: { data: { blocked: [] } } });
    if (pathname.endsWith('/plans')) return route.fulfill({ json: { plans: [] } });
    if (pathname === '/api/chat/conversations') return route.fulfill({ json: [{ id: conversationId, title: 'Proposta de vídeo' }] });
    if (pathname === `/api/chat/conversations/${conversationId}`) return route.fulfill({ json: {
      id: conversationId, title: 'Proposta de vídeo', messages: scenario === 'timeline' ? [
        { id: 'prompt', role: 'user', content: 'Crie um vídeo', created_at: '2026-11-10T09:59:00.000Z' },
        { id: 'proposal', role: 'assistant', content: 'Proposta apresentada', created_at: '2026-11-10T10:02:00.000Z' },
      ] : [{ id: 'intro', role: 'assistant', content: 'Revise o roteiro antes de confirmar.' }],
      approvals: [{ id: approvalId, action: 'Criar vídeo', parameters: { duration: 15, aspectRatio: '9:16' }, status: state.status, created_at: scenario === 'timeline' ? '2026-11-10T10:01:00.000Z' : undefined, result: state.result }],
    } });
    if (pathname === `/api/chat/approvals/${approvalId}/confirm` && request.method() === 'POST') {
      state.confirmations++;
      if (scenario === 'network') return route.abort('failed');
      if (scenario === 'refused') {
        state.status = 'failed';
        state.result = { code: 'VIDEO_NOT_IN_PLAN', error: planMessage };
        return route.fulfill({ status: 403, json: { detail: { status: 'failed', code: 'VIDEO_NOT_IN_PLAN', message: 'Texto externo que não deve ser exibido.' } } });
      }
      if (scenario === 'processing') {
        state.status = 'processing';
        state.result = { jobId: approvalId, job: { status: 'running', stage: 'script' } };
        return route.fulfill({ status: 202, json: { status: state.status, result: state.result } });
      }
      if (scenario === 'timeline') {
        state.status = 'completed';
        state.result = {};
        return route.fulfill({ status: 200, json: { status: state.status, result: state.result } });
      }
      return route.fulfill({ status: 502, json: { detail: { status: 'failed', code: 'VIDEO_NOT_IN_PLAN' } } });
    }
    if (pathname === `/api/chat/conversations/${conversationId}/messages` && request.method() === 'POST') {
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: `event: done\ndata: ${JSON.stringify({ message: { id: 'reply', content: 'Resposta posterior', created_at: '2026-11-10T10:04:00.000Z' } })}\n\n` });
    }
    return route.fulfill({ status: 404, json: { error: 'isolated endpoint' } });
  });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Somente essenciais' }).click();
  if (page.viewportSize()!.width < 768) await page.getByRole('button', { name: 'Mostrar conversas' }).click();
  await page.getByRole('button', { name: 'Proposta de vídeo', exact: true }).click();
  return state;
}

for (const theme of ['light', 'dark'] as const) {
  test(`recusa conhecida mostra motivo e persiste ao reabrir — ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize(theme === 'dark' ? { width: 375, height: 812 } : { width: 1287, height: 652 });
    const state = await isolateConfirmation(page, 'refused', theme);
    await page.getByRole('button', { name: 'Confirmar ação' }).click();
    const card = page.locator('.ady-chat-approval');
    await expect(card).toHaveAttribute('data-status', 'failed');
    await expect(card.getByRole('alert')).toHaveText(planMessage);
    await expect(page.getByText(uncertainMessage)).toHaveCount(0);
    await expect(page.getByText('Texto externo que não deve ser exibido.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirmar ação' })).toHaveCount(0);
    await page.reload();
    if (page.viewportSize()!.width < 768) await page.getByRole('button', { name: 'Mostrar conversas' }).click();
    await page.getByRole('button', { name: 'Proposta de vídeo', exact: true }).click();
    await expect(card.getByRole('alert')).toHaveText(planMessage);
    await expect(page.getByRole('button', { name: 'Confirmar ação' })).toHaveCount(0);
    expect(state.confirmations).toBe(1);
    expect(state.requests.filter(item => item.startsWith('POST '))).toHaveLength(1);
    expect(state.pageErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`confirmation-${theme}.png`), fullPage: true });
  });
}

for (const scenario of ['unknown', 'network'] as const) {
  test(`falha ${scenario} permanece incerta e não libera repetição`, async ({ page }) => {
    const state = await isolateConfirmation(page, scenario);
    await page.getByRole('button', { name: 'Confirmar ação' }).click();
    await expect(page.getByText(uncertainMessage)).toBeVisible();
    await expect(page.getByText(planMessage)).toHaveCount(0);
    await page.getByRole('button', { name: 'Atualizar conversa' }).click();
    await expect(page.getByText(uncertainMessage)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar ação' })).toHaveCount(0);
    expect(state.confirmations).toBe(1);
    expect(state.pageErrors).toEqual([]);
  });
}

test('202 acompanha a geração sem declarar conclusão nem reenviar', async ({ page }) => {
  const state = await isolateConfirmation(page, 'processing');
  await page.getByRole('button', { name: 'Confirmar ação' }).click();
  await expect(page.getByText('Status: Em andamento')).toBeVisible();
  await expect(page.getByText('Status: Concluída')).toHaveCount(0);
  await expect(page.getByText(uncertainMessage)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar ação' })).toHaveCount(0);
  expect(state.confirmations).toBe(1);
  expect(state.pageErrors).toEqual([]);
});

test('confirmação permanece antes das mensagens enviadas depois', async ({ page }, testInfo) => {
  const state = await isolateConfirmation(page, 'timeline');
  await page.getByRole('button', { name: 'Confirmar ação' }).click();
  await expect(page.locator('.ady-chat-approval')).toHaveAttribute('data-status', 'completed');
  await page.getByRole('textbox', { name: 'Mensagem' }).fill('E depois?');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(page.getByText('Resposta posterior')).toBeVisible();
  const items = await page.locator('.ady-chat-message, .ady-chat-approval').evaluateAll(nodes => nodes.map(node => ({
    type: node.classList.contains('ady-chat-approval') ? 'approval' : node.getAttribute('data-role'),
    text: node.textContent || '',
  })));
  expect(items).toHaveLength(5);
  expect(items.map(item => item.type)).toEqual(['user', 'assistant', 'approval', 'user', 'assistant']);
  expect(items[0].text).toContain('Crie um vídeo');
  expect(items[1].text).toContain('Proposta apresentada');
  expect(items[2].text).toContain('Ação: Criar vídeo');
  expect(items[3].text).toContain('E depois?');
  expect(items[4].text).toContain('Resposta posterior');
  expect(state.confirmations).toBe(1);
  expect(state.pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('chat-approval-timeline.png'), fullPage: true });
});
