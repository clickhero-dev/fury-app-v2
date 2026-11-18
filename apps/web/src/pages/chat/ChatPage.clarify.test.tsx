// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatPage } from './ChatPage';
vi.mock('../../lib/session-refresh', () => ({refreshSession: vi.fn()}));
vi.mock('./useChatPlans', () => ({useChatPlans: () => ({plans:[], errors:{}, error:null, busyPlanIds:[], refetch:vi.fn(), onAction:vi.fn(), onEdit:vi.fn(), onCompleteTask:vi.fn()})}));
beforeEach(() => { sessionStorage.clear(); localStorage.setItem('token','token'); });
it('mostra opções persistidas, responde uma vez e conserva seleção após reload', async () => {
  let selected: number | null = null;
  let answerBody: Record<string, unknown> = {};
  const clarify = () => ({id:'clar',run_id:'run',message_id:'m',question:'Qual opção?',choices:['Um','Dois'],selected_index:selected});
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/clarifications/clar/answer') && init?.method === 'POST') { answerBody = JSON.parse(init.body as string); selected = answerBody.choiceIndex as number; return new Response(`event: done\ndata: ${JSON.stringify({message:{id:'r',role:'assistant',content:'Entendi'}})}\n\n`); }
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[{id:'m',role:'assistant',content:'Escolha'}],clarifications:[clarify()],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  expect(await screen.findByText('Qual opção?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Dois'}));
  await screen.findByText('Entendi');
  expect(selected).toBe(1);
  expect(answerBody.responseCapabilities).toEqual(['multi_message_v1']);
  expect(fetcher.mock.calls.filter(call => call[0].endsWith('/answer'))).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect((screen.getByRole('button',{name:'Dois'}) as HTMLButtonElement).disabled).toBe(true));
});
it('desabilita uma pergunta obsoleta recuperada do servidor', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[{id:'m',role:'assistant',content:'Escolha'}],clarifications:[{id:'clar',run_id:'run',message_id:'m',question:'Qual opção?',choices:['Um','Dois'],selected_index:null,dismissed_at:'2026-11-13T00:00:00Z'}],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  expect((await screen.findByRole('button',{name:'Um'}) as HTMLButtonElement).disabled).toBe(true);
});
it('não envia seleção duas vezes e mantém o stream na conversa original ao navegar', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let answerRequests = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[{id:'m',role:'assistant',content:'Escolha'}],clarifications:[{id:'clar',run_id:'r0',message_id:'m',question:'Qual opção?',choices:['Um','Dois'],selected_index:null}],approvals:[]}));
    if (url.endsWith('/conversations/b')) return new Response(JSON.stringify({messages:[{id:'b1',role:'assistant',content:'Outra conversa'}],approvals:[]}));
    if (url.endsWith('/answer')) { answerRequests++; return new Response(new ReadableStream({start(c) { controller = c; }})); }
    throw new Error(url);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  const choice = await screen.findByRole('button',{name:'Um'});
  fireEvent.click(choice); fireEvent.click(choice);
  await waitFor(() => expect(controller).toBeDefined());
  expect(answerRequests).toBe(1);
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await screen.findByText('Outra conversa');
  await act(async () => { controller.enqueue(new TextEncoder().encode('event: done\ndata: {"run_id":"r1","user_message_id":"u1","messages":[{"id":"m1","role":"assistant","content":"Resposta A"}]}\n\n')); controller.close(); });
  expect(screen.queryByText('Resposta A')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  expect(await screen.findByText('Resposta A')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Um'})).toHaveAttribute('aria-pressed','true');
});
it('recupera conflito de pergunta já respondida sem bloquear novos envios', async () => {
  let closed = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/clarifications/clar/answer')) { closed = true; return new Response(JSON.stringify({code:'clarification_closed'}),{status:409}); }
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[{id:'m',role:'assistant',content:'Escolha'}],clarifications:[{id:'clar',run_id:'run',message_id:'m',question:'Qual opção?',choices:['Um','Dois'],selected_index:closed ? 0 : null}],approvals:[],response_runs:[],client_keys:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  fireEvent.click(await screen.findByRole('button',{name:'Um'}));
  await screen.findByText('Esta pergunta já foi respondida ou ficou obsoleta. A conversa foi atualizada.');
  expect((screen.getByRole('button',{name:'Um'}) as HTMLButtonElement).disabled).toBe(true);
  expect(JSON.parse(sessionStorage.getItem('ady-chat-pending-sends') || '{}').a).toEqual([]);
});
it('recupera opções quando uma resposta em andamento termina após recarregar', async () => {
  let polls = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) {
      polls++;
      return new Response(JSON.stringify(polls === 1
        ? {messages:[{id:'u',role:'user',content:'Pergunta'}],approvals:[],response_run:{status:'running'}}
        : {messages:[{id:'u',role:'user',content:'Pergunta'},{id:'m',role:'assistant',content:'Escolha'}],approvals:[],response_run:null,clarifications:[{id:'clar',run_id:'run',message_id:'m',question:'Qual opção?',choices:['Um','Dois'],selected_index:null}]}));
    }
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  expect(await screen.findByRole('button',{name:'Um'}, {timeout:5000})).toBeEnabled();
}, 7000);
it('preserva pergunta de outro stream que termina durante recuperação da seleção', async () => {
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  let reads = 0;
  let recover!: (response: Response) => void;
  const original = {id:'c1',run_id:'r0',message_id:'m0',question:'Primeira pergunta?',choices:['Um','Dois'],selected_index:null};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) {
      if (++reads === 1) return new Response(JSON.stringify({messages:[{id:'m0',role:'assistant',content:'Escolha'}],clarifications:[original],approvals:[]}));
      return new Promise<Response>(resolve => { recover = resolve; });
    }
    if (init?.method === 'POST') return new Response(new ReadableStream({start(c) { streams.push(c); }}));
    throw new Error(url);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  fireEvent.click(await screen.findByRole('button',{name:'Um'}));
  await waitFor(() => expect(streams).toHaveLength(1));
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Outra pergunta'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(streams).toHaveLength(2));
  await act(async () => streams[0].error(new Error('offline')));
  await waitFor(() => expect(recover).toBeDefined());
  const clarification = {id:'c2',run_id:'r2',message_id:'m2',question:'Outra escolha?',choices:['A','B'],selected_index:null};
  await act(async () => { streams[1].enqueue(new TextEncoder().encode(`event: done\ndata: ${JSON.stringify({message:{id:'m2',role:'assistant',content:'Nova resposta'},clarification})}\n\n`)); streams[1].close(); });
  expect(await screen.findByText('Outra escolha?')).toBeInTheDocument();
  await act(async () => recover(new Response(JSON.stringify({messages:[{id:'m0',role:'assistant',content:'Escolha'}],clarifications:[{...original,selected_index:0}],approvals:[],response_runs:[]}))));
  expect(screen.getByText('Outra escolha?')).toBeInTheDocument();
});
it('desabilita pergunta de stream anterior quando outra mensagem já foi aceita', async () => {
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  let answers = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],clarifications:[],approvals:[]}));
    if (url.endsWith('/answer')) { answers++; throw new Error('stale answer'); }
    if (init?.method === 'POST') return new Response(new ReadableStream({start(c) { streams.push(c); }}));
    throw new Error(url);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  for (const text of ['Primeira', 'Segunda']) {
    fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:text}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await waitFor(() => expect(streams).toHaveLength(text === 'Primeira' ? 1 : 2));
  }
  await act(async () => { streams[0].enqueue(new TextEncoder().encode(`event: done\ndata: ${JSON.stringify({message:{id:'m1',role:'assistant',content:'Escolha'},clarification:{id:'c1',run_id:'r1',message_id:'m1',question:'Pergunta antiga?',choices:['Um','Dois'],selected_index:null}})}\n\n`)); streams[0].close(); });
  await act(async () => { streams[1].enqueue(new TextEncoder().encode('event: done\ndata: {"message":{"id":"m2","role":"assistant","content":"Resposta nova"}}\n\n')); streams[1].close(); });
  const choice = await screen.findByRole('button',{name:'Um'});
  expect(choice).toBeDisabled();
  fireEvent.click(choice);
  expect(answers).toBe(0);
});
it('responder uma pergunta desabilita outras perguntas abertas', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[{id:'m1',role:'assistant',content:'Pergunta 1'},{id:'m2',role:'assistant',content:'Pergunta 2'}],clarifications:[
      {id:'c1',run_id:'r1',message_id:'m1',question:'Primeira?',choices:['Um'],selected_index:null},
      {id:'c2',run_id:'r2',message_id:'m2',question:'Segunda?',choices:['Dois'],selected_index:null},
    ],approvals:[]}));
    if (url.endsWith('/answer')) return new Response('event: done\ndata: {"message":{"id":"reply","role":"assistant","content":"Entendi"}}\n\n');
    throw new Error(url);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  fireEvent.click(await screen.findByRole('button',{name:'Um'}));
  await screen.findByText('Entendi');
  await waitFor(() => expect(screen.getByRole('button',{name:'Dois'})).toBeDisabled());
  expect(screen.getByRole('button',{name:'Um'})).toHaveAttribute('aria-pressed','true');
});
