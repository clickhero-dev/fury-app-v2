// @vitest-environment jsdom
/*
Funcionalidade: confirmação recusada sem resultado fictício
Cenário: o plano não permite criar vídeo
Dado que uma proposta foi feita antes da mudança de disponibilidade
Quando confirmo e o servidor registra uma recusa conhecida
Então vejo o motivo seguro, sem nova confirmação nem resultado desconhecido
Cenário: reabrir uma recusa registrada
Dado que a conversa contém uma recusa classificada persistida
Quando reabro a conversa
Então o motivo continua visível sem reenviar a ação
Cenário: a resposta não confirma uma recusa conhecida
Dado um erro de transporte, autorização, corpo inválido ou código não reconhecido
Quando a confirmação falha
Então mantenho o resultado incerto e bloqueio novo envio
Cenário: clique duplicado na confirmação
Dado uma ação pendente
Quando clico duas vezes antes de receber a recusa
Então somente uma confirmação é enviada
Cenário: mensagens novas permanecem depois da aprovação que as antecede
Dado uma ação confirmada entre duas respostas da Ady
Quando envio outra mensagem depois da confirmação
Então o cartão continua entre a resposta original e as mensagens posteriores
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ChatPage } from './ChatPage';

vi.mock('../../lib/session-refresh', () => ({ refreshSession: vi.fn() }));
vi.mock('./useChatPlans', () => ({useChatPlans: () => ({
  plans: [], loading: false, refreshing: false, error: null, errors: {}, busyPlanIds: [],
  refetch: vi.fn().mockResolvedValue(undefined), onAction: vi.fn().mockResolvedValue(true),
  onEdit: vi.fn().mockResolvedValue(true), onCompleteTask: vi.fn().mockResolvedValue(true),
})}));

const PLAN_MESSAGE = 'A criação de vídeos não está disponível no seu plano atual.';
const UNCERTAIN_MESSAGE = 'O resultado não pôde ser confirmado. Verifique o estado da ação antes de tentar novamente.';
const initialApproval = { id: 'approval-1', action: 'Criar vídeo', status: 'pending', parameters: { duration: 15 } };

function mockConfirmation(status: number, body: unknown, historyApproval: unknown = initialApproval) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{ id: 'conversation-1', title: 'Vídeo de teste' }]));
    if (url.endsWith('/conversations/conversation-1')) return new Response(JSON.stringify({ messages: [], approvals: [historyApproval] }));
    if (url.endsWith('/confirm') && init?.method === 'POST') return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    throw new Error(`Unexpected test request: ${init?.method || 'GET'} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('token', 'test-session');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Recusas de aprovação', () => {
  it('explica recusa conhecida do plano e não oferece reenviar a ação', async () => {
    const fetchMock = mockConfirmation(403, { detail: { status: 'failed', code: 'VIDEO_NOT_IN_PLAN', message: 'texto arbitrário que não pode vazar' } });
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vídeo de teste' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar ação' }));
    const card = document.querySelector('.ady-chat-approval') as HTMLElement;
    await waitFor(() => expect(within(card).getByText(PLAN_MESSAGE)).toBeInTheDocument());
    expect(card).toHaveAttribute('data-status', 'failed');
    expect(screen.queryByText(UNCERTAIN_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText('texto arbitrário que não pode vazar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar ação' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/confirm'))).toHaveLength(1);
  });

  it('preserva o motivo registrado ao reabrir, mesmo após incerteza anterior', async () => {
    const fetchMock = mockConfirmation(403, {}, { ...initialApproval, status: 'failed', result: { code: 'VIDEO_NOT_IN_PLAN', error: 'texto externo descartado' } });
    sessionStorage.setItem('ady-chat-uncertain-approvals', JSON.stringify([initialApproval.id]));
    const first = render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vídeo de teste' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(PLAN_MESSAGE);
    first.unmount();
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vídeo de teste' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(PLAN_MESSAGE);
    expect(screen.queryByText(UNCERTAIN_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar ação' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/confirm'))).toHaveLength(0);
  });

  it.each([
    [400, {}], [401, {}], [404, {}],
    [403, { detail: { status: 'failed', code: 'UNKNOWN_CODE', message: 'texto externo descartado' } }],
    [403, { detail: { status: 'unknown', code: 'VIDEO_NOT_IN_PLAN' } }],
    [502, { detail: { status: 'failed', code: 'VIDEO_NOT_IN_PLAN' } }],
  ])('mantém resultado incerto para HTTP%s e corpo incompatível %j', async (status, body) => {
    const fetchMock = mockConfirmation(status as number, body);
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vídeo de teste' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar ação' }));
    expect(await screen.findByText(UNCERTAIN_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(PLAN_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText('texto externo descartado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar ação' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/confirm'))).toHaveLength(1);
  });

  it('não duplica confirmação enquanto a resposta está pendente', async () => {
    const fetchMock = mockConfirmation(403, {});
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vídeo de teste' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmar ação' });
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    resolve(new Response(JSON.stringify({ detail: { status: 'failed', code: 'VIDEO_NOT_IN_PLAN' } }), { status: 403 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(PLAN_MESSAGE);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/confirm'))).toHaveLength(1);
  });

  it.each(['corpo inválido', 'conexão perdida'])('não inventa motivo diante de %s', async reason => {
    const fetchMock = mockConfirmation(403, {});
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vídeo de teste' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmar ação' });
    if (reason === 'corpo inválido') fetchMock.mockResolvedValueOnce(new Response('<html>texto externo descartado</html>', { status: 403 }));
    else fetchMock.mockRejectedValueOnce(new TypeError('texto externo descartado'));
    fireEvent.click(confirm);
    expect(await screen.findByText(UNCERTAIN_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(PLAN_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText('texto externo descartado')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/confirm'))).toHaveLength(1);
  });

  it('mantém o cartão de aprovação entre a resposta original e as mensagens seguintes', async () => {
    const stream = new ReadableStream({start(controller) {
      controller.enqueue(new TextEncoder().encode(`event: done\ndata: ${JSON.stringify({message:{content:'Resposta posterior',created_at:'2026-11-10T10:04:00.000Z'}})}\n\n`));
      controller.close();
    }});
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'conversation-1',title:'Vídeo de teste'}]));
      if (url.endsWith('/conversations/conversation-1') && init?.method !== 'POST') return new Response(JSON.stringify({messages:[
        {id:'user-before',role:'user',content:'Crie um vídeo',created_at:'2026-11-10T09:59:00.000Z'},
        {id:'assistant-proposal',role:'assistant',content:'Proposta apresentada',created_at:'2026-11-10T10:02:00.000Z'},
      ],approvals:[{...initialApproval,created_at:'2026-11-10T10:01:00.000Z'}]}));
      if (url.endsWith('/approvals/approval-1/confirm')) return new Response(JSON.stringify({status:'completed',result:{}}));
      if (url.endsWith('/conversations/conversation-1/messages')) return new Response(stream, {headers:{'Content-Type':'text/event-stream'}});
      throw new Error(`Unexpected test request: ${init?.method || 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage/>);
    fireEvent.click(await screen.findByRole('button', {name:'Vídeo de teste'}));
    fireEvent.click(await screen.findByRole('button', {name:'Confirmar ação'}));
    expect(await screen.findByText('Status: Concluída')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'E depois?'}});
    fireEvent.click(screen.getByRole('button', {name:'Enviar mensagem'}));
    expect(await screen.findByText('Resposta posterior')).toBeInTheDocument();
    const entries = Array.from(document.querySelectorAll('.ady-chat-message, .ady-chat-approval'));
    const text = entries.map(entry => entry.textContent || '');
    expect(text.findIndex(value => value.includes('Proposta apresentada'))).toBeLessThan(text.findIndex(value => value.includes('Ação: Criar vídeo')));
    expect(text.findIndex(value => value.includes('Ação: Criar vídeo'))).toBeLessThan(text.findIndex(value => value.includes('E depois?')));
    expect(text.findIndex(value => value.includes('E depois?'))).toBeLessThan(text.findIndex(value => value.includes('Resposta posterior')));
  });
});
