// @vitest-environment jsdom
/*
Funcionalidade: sincronizar planos persistidos por conversa
Cenário: abrir e recarregar planos
Dado uma conversa selecionada, Quando abro ou recarrego, Então obtenho os planos persistidos pelo HTTP autenticado.
Cenário: aprovar com versão e impedir clique duplicado
Dado um rascunho, Quando aprovo duas vezes, Então só uma mutação é enviada e só a resposta confirma o avanço.
Cenário: falha de permissão ou serviço
Dado falhas 400/401/403/404/429/500, Quando altero o plano, Então mantenho o estado e mostro um erro útil sem payload privado.
Cenário: conflito de versão
Dado uma revisão antiga, Quando o servidor responde 409, Então recarrego sem repetir a ação.
Cenário: atualizar somente planos ativos
Dado um plano em execução, Quando passa o intervalo, Então consulto até receber estado final e interrompo o polling.
Cenário: ignorar respostas antigas
Dado uma consulta antiga, Quando troco de conversa ou atualizo novamente, Então aborto e ignoro a resposta anterior.
Cenário: tempo limite
Dado um servidor sem resposta, Quando esgota o prazo, Então libero os controles e mantenho o estado conhecido.
Cenário: dados inválidos
Dado uma resposta incompatível ou de outra conversa, Quando recebo os planos, Então não substituo dados confirmados por dados inválidos.
Cenário: concluir somente manual
Dado uma tarefa automática, Quando um consumidor tenta concluir, Então nenhuma requisição de conclusão é enviada.
Cenário: primeira resposta cria o plano depois de iniciar a conversa
Dado o callback de envio capturado antes da conversa existir, Quando chega done após sua criação, Então refetch consulta a conversa atualmente selecionada.
*/
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatPlans, CHAT_PLANS_POLL_MS, CHAT_PLANS_TIMEOUT_MS } from './useChatPlans';
import type { ChatPlan, ChatPlanTask } from './chat-plans';

vi.mock('../../lib/session-refresh', () => ({ refreshSession: vi.fn() }));
const fetchMock = vi.fn();
function task(overrides: Partial<ChatPlanTask> = {}): ChatPlanTask {
  return { id: 'task-1', key: 'marca', title: 'Consultar a marca', capability: 'read_brand', parameters: {}, dependsOn: [], status: 'pending', ...overrides };
}
function plan(overrides: Partial<ChatPlan> = {}): ChatPlan {
  return { id: 'plan-1', conversationId: 'conversation-1', title: 'Plano semanal', goal: 'Preparar conteúdos.', status: 'draft', version: 1, tasks: [task()], createdAt: '2026-11-10T12:00:00Z', updatedAt: '2026-11-10T12:00:00Z', ...overrides };
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); localStorage.setItem('token', 'test-session'); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Planos persistidos', () => {
  it('mantém refetch atual para o done capturado antes de criar a primeira conversa', async () => {
    fetchMock.mockResolvedValueOnce(response({ plans: [] })).mockResolvedValueOnce(response({ plans: [plan()] }));
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useChatPlans(id, true), { initialProps: { id: null as string | null } });
    const onChatDone = result.current.refetch;
    rerender({ id: 'conversation-1' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plans).toEqual([]);
    await act(async () => { await onChatDone(); });
    expect(result.current.plans[0]?.title).toBe('Plano semanal');
    expect(result.current.refetch).toBe(onChatDone);
  });

  it('carrega e recarrega o contrato HTTP sem executar automaticamente', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response({ plans: [plan()] })));
    const first = renderHook(() => useChatPlans('conversation-1', true));
    await waitFor(() => expect(first.result.current.plans).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/chat\/conversations\/conversation-1\/plans$/), expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer test-session' }) }));
    await act(async () => { await first.result.current.refetch(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    first.unmount();
    const second = renderHook(() => useChatPlans('conversation-1', true));
    await waitFor(() => expect(second.result.current.plans[0].version).toBe(1));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
  });

  it('envia versão na aprovação, bloqueia duplicação e só aceita progresso confirmado', async () => {
    const pending = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response({ plans: [plan()] })).mockImplementationOnce(() => pending.promise);
    const { result } = renderHook(() => useChatPlans('conversation-1', true));
    await waitFor(() => expect(result.current.plans).toHaveLength(1));
    let first!: Promise<boolean>;
    await act(async () => {
      first = result.current.onAction(plan(), 'approve');
      expect(await result.current.onAction(plan(), 'approve')).toBe(false);
    });
    expect(result.current.busyPlanIds).toEqual(['plan-1']);
    expect(result.current.plans[0].status).toBe('draft');
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringMatching(/\/plans\/plan-1\/approve$/), expect.objectContaining({ method: 'POST', body: JSON.stringify({ version: 1 }) }));
    await act(async () => { pending.resolve(response({ plan: plan({ version: 2, status: 'running' }) })); expect(await first).toBe(true); });
    expect(result.current.plans[0].status).toBe('running');
    expect(result.current.busyPlanIds).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [400, 'Confira os dados'], [401, 'Sua sessão expirou'], [403, 'permissão'],
    [404, 'não está mais disponível'], [429, 'Muitas tentativas'], [500, 'Não foi possível atualizar'],
  ])('preserva o plano após HTTP %s e permite tentar outra vez', async (status, message) => {
    fetchMock.mockResolvedValueOnce(response({ plans: [plan()] })).mockResolvedValue(response({ error: { message: 'token privado' } }, Number(status)));
    const { result } = renderHook(() => useChatPlans('conversation-1', true));
    await waitFor(() => expect(result.current.plans).toHaveLength(1));
    await act(async () => { expect(await result.current.onAction(plan(), 'cancel')).toBe(false); });
    expect(result.current.plans).toEqual([plan()]);
    expect(result.current.errors['plan-1']).toContain(message);
    expect(result.current.errors['plan-1']).not.toContain('token privado');
    expect(result.current.busyPlanIds).toEqual([]);
    await act(async () => { await result.current.onAction(plan(), 'cancel'); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('recarrega um conflito 409 sem reaplicar a ação antiga', async () => {
    fetchMock.mockResolvedValueOnce(response({ plans: [plan()] }))
      .mockResolvedValueOnce(response({}, 409))
      .mockResolvedValueOnce(response({ plans: [plan({ version: 4, status: 'paused' })] }));
    const { result } = renderHook(() => useChatPlans('conversation-1', true));
    await waitFor(() => expect(result.current.plans).toHaveLength(1));
    await act(async () => { expect(await result.current.onAction(plan(), 'approve')).toBe(false); });
    expect(result.current.plans[0]).toMatchObject({ version: 4, status: 'paused' });
    expect(result.current.errors['plan-1']).toContain('O plano mudou');
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
  });

  it('envia edição tipada com a versão revisada e conclusão manual em rota própria', async () => {
    const manual = task({ capability: 'manual', parameters: { instructions: 'Revise.' }, status: 'pending' });
    const draft = plan({ tasks: [manual] });
    fetchMock.mockResolvedValueOnce(response({ plans: [draft] }))
      .mockResolvedValueOnce(response({ plan: { ...draft, version: 2, title: 'Revisão' } }))
      .mockResolvedValueOnce(response({ plan: { ...draft, version: 3, status: 'completed', tasks: [{ ...manual, status: 'completed' }] } }));
    const { result } = renderHook(() => useChatPlans('conversation-1', true));
    await waitFor(() => expect(result.current.plans).toHaveLength(1));
    const changes = { version: 1, title: 'Revisão' };
    await act(async () => { expect(await result.current.onEdit(draft, changes)).toBe(true); });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify(changes) });
    await act(async () => { expect(await result.current.onCompleteTask({ ...draft, version: 2, status: 'running' }, manual)).toBe(true); });
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringMatching(/\/plans\/plan-1\/tasks\/task-1\/complete$/), expect.objectContaining({ body: JSON.stringify({ version: 2 }) }));
  });

  it('recusa conclusão automática antes de chegar ao servidor', async () => {
    fetchMock.mockResolvedValue(response({ plans: [plan({ status: 'running' })] }));
    const { result } = renderHook(() => useChatPlans('conversation-1', true));
    await waitFor(() => expect(result.current.plans).toHaveLength(1));
    await act(async () => { expect(await result.current.onCompleteTask(plan({ status: 'running' }), task())).toBe(false); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.errors['plan-1']).toContain('Somente tarefas manuais');
  });

  it('consulta planos ativos e para depois do estado final sem consultar rascunhos', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(response({ plans: [plan()] }))
      .mockResolvedValueOnce(response({ plan: plan({ status: 'running', version: 2 }) }))
      .mockResolvedValueOnce(response({ plans: [plan({ status: 'completed', version: 3, tasks: [task({ status: 'completed' })] })] }));
    const { result } = renderHook(() => useChatPlans('conversation-1', true));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(CHAT_PLANS_POLL_MS * 2); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.onAction(plan(), 'approve'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(CHAT_PLANS_POLL_MS); });
    expect(result.current.plans[0].status).toBe('completed');
    await act(async () => { await vi.advanceTimersByTimeAsync(CHAT_PLANS_POLL_MS * 3); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reconsulta aprovação pendente após falha temporária sem apagar progresso confirmado', async () => {
    vi.useFakeTimers();
    const waiting = plan({ status: 'waiting_approval', version: 2, tasks: [task({ status: 'waiting_approval', approvalId: 'approval-1' })] });
    const done = plan({ status: 'completed', version: 3, tasks: [task({ status: 'completed' })] });
    fetchMock.mockResolvedValueOnce(response({ plans: [waiting] }))
      .mockResolvedValueOnce(response({}, 500))
      .mockResolvedValueOnce(response({ plans: [done] }));
    const { result } = renderHook(() => useChatPlans('conversation-1', true));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(CHAT_PLANS_POLL_MS); });
    expect(result.current.plans).toEqual([waiting]);
    expect(result.current.error).toContain('Não foi possível carregar');
    await act(async () => { await vi.advanceTimersByTimeAsync(CHAT_PLANS_POLL_MS); });
    expect(result.current.plans).toEqual([done]);
    expect(result.current.error).toBeNull();
  });

  it('aborta e ignora consulta da conversa anterior mesmo quando o transporte ignora aborto', async () => {
    const old = deferred<Response>();
    fetchMock.mockImplementationOnce(() => old.promise).mockResolvedValueOnce(response({ plans: [plan({ id: 'plan-2', conversationId: 'conversation-2', title: 'Outro plano' })] }));
    const { result, rerender } = renderHook(({ id }) => useChatPlans(id, true), { initialProps: { id: 'conversation-1' } });
    const previousSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    rerender({ id: 'conversation-2' });
    await waitFor(() => expect(result.current.plans[0]?.title).toBe('Outro plano'));
    expect(previousSignal.aborted).toBe(true);
    await act(async () => { old.resolve(response({ plans: [plan()] })); });
    expect(result.current.plans[0].conversationId).toBe('conversation-2');
  });

  it('ignora uma mutação antiga ao trocar conversa e não transfere erro nem estado ocupado', async () => {
    const pending = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response({ plans: [plan()] })).mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(response({ plans: [] }));
    const { result, rerender } = renderHook(({ id }) => useChatPlans(id, true), { initialProps: { id: 'conversation-1' } });
    await waitFor(() => expect(result.current.plans).toHaveLength(1));
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.onAction(plan(), 'approve'); });
    const signal = fetchMock.mock.calls[1][1].signal as AbortSignal;
    rerender({ id: 'conversation-2' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { pending.resolve(response({ plan: plan({ status: 'running', version: 2 }) })); await mutation; });
    expect(signal.aborted).toBe(true);
    expect(result.current.plans).toEqual([]);
    expect(result.current.busyPlanIds).toEqual([]);
    expect(result.current.errors).toEqual({});
  });

  it('a atualização mais recente vence uma consulta atrasada', async () => {
    const old = deferred<Response>();
    fetchMock.mockImplementationOnce(() => old.promise).mockResolvedValueOnce(response({ plans: [plan({ title: 'Versão atual', version: 4 })] }));
    const { result } = renderHook(() => useChatPlans('conversation-1', true));
    await act(async () => { await result.current.refetch(); });
    await act(async () => { old.resolve(response({ plans: [plan()] })); });
    expect(result.current.plans[0].version).toBe(4);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('trata timeout sem fingir que a aprovação foi recusada ou concluída', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(response({ plans: [plan()] })).mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderHook(() => useChatPlans('conversation-1', true));
    await act(async () => {});
    let mutation!: Promise<boolean>;
    act(() => { mutation = result.current.onAction(plan(), 'approve'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(CHAT_PLANS_TIMEOUT_MS); expect(await mutation).toBe(false); });
    expect(result.current.busyPlanIds).toEqual([]);
    expect(result.current.plans[0].status).toBe('draft');
    expect(result.current.errors['plan-1']).toContain('A resposta demorou');
  });

  it.each([{ plans: [{ ...plan(), status: 'inventado' }] }, { plans: [plan({ conversationId: 'outra' })] }, { plans: 'não é lista' }])('não aceita resposta incompatível ou de outra conversa', async invalid => {
    fetchMock.mockResolvedValueOnce(response({ plans: [plan()] })).mockResolvedValueOnce(response(invalid));
    const { result } = renderHook(() => useChatPlans('conversation-1', true));
    await waitFor(() => expect(result.current.plans).toHaveLength(1));
    await act(async () => { await result.current.refetch(); });
    expect(result.current.plans).toEqual([plan()]);
    expect(result.current.error).toContain('Não foi possível carregar');
  });

  it('não faz HTTP sem conversa ou quando desabilitado', async () => {
    const { result, rerender } = renderHook(({ id, enabled }: { id: string | null; enabled: boolean }) => useChatPlans(id, enabled), { initialProps: { id: null as string | null, enabled: true } });
    await act(async () => { await result.current.refetch(); });
    rerender({ id: 'conversation-1', enabled: false });
    await act(async () => { await result.current.refetch(); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.plans).toEqual([]);
  });
});
