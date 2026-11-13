// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatPage } from './ChatPage';
vi.mock('../../lib/session-refresh', () => ({refreshSession: vi.fn()}));
vi.mock('./useChatPlans', () => ({useChatPlans: () => ({plans:[], errors:{}, error:null, busyPlanIds:[], refetch:vi.fn(), onAction:vi.fn(), onEdit:vi.fn(), onCompleteTask:vi.fn()})}));
beforeEach(() => { sessionStorage.clear(); localStorage.setItem('token','token'); });
it('preserva a resposta na conversa original ao navegar durante o stream', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/a/messages') && init?.method === 'POST') return new Response(new ReadableStream({start(c) { controller = c; }}));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    if (url.endsWith('/conversations/b')) return new Response(JSON.stringify({messages:[{id:'b1',role:'user',content:'Somente B'}],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pergunta A'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(controller).toBeDefined());
  expect(screen.getByRole('button',{name:'Conversa B'})).toBeEnabled();
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  expect(await screen.findByText('Somente B')).toBeInTheDocument();
  await act(async () => { controller.enqueue(new TextEncoder().encode('event: approval\ndata: {"id":"approval-a","action":"Apenas A","parameters":{},"status":"pending"}\n\nevent: done\ndata: {"message":{"content":"Resposta A"}}\n\n')); controller.close(); });
  expect(screen.queryByText('Resposta A')).toBeNull();
  expect(screen.queryByText(/Apenas A/)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  expect(await screen.findByText('Resposta A')).toBeInTheDocument();
  expect(screen.getByText(/Apenas A/)).toBeInTheDocument();
});

it('mantém aprovação confirmada ao receber outra aprovação durante o stream', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const pending = {id:'p1',action:'Ação original',parameters:{},status:'pending'};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/a/messages') && init?.method === 'POST') return new Response(new ReadableStream({start(c) { controller = c; }}));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[pending]}));
    if (url.endsWith('/approvals/p1/confirm')) return new Response(JSON.stringify({status:'completed',result:{}}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await screen.findByText(/Ação original/);
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pergunta'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(controller).toBeDefined());
  fireEvent.click(screen.getByRole('button',{name:'Confirmar ação'}));
  await screen.findByText('Status: Concluída');
  await act(async () => { controller.enqueue(new TextEncoder().encode('event: approval\ndata: {"id":"p2","action":"Outra ação","parameters":{},"status":"pending"}\n\n')); });
  expect(screen.getByText('Status: Concluída')).toBeInTheDocument();
  expect(screen.getAllByRole('button',{name:'Confirmar ação'})).toHaveLength(1);
  await act(async () => { controller.enqueue(new TextEncoder().encode('event: done\ndata: {"message":{"content":"Resposta"}}\n\n')); controller.close(); });
});

it('preserva progresso de aprovação consultado durante stream ao chegar novo evento', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let loads = 0;
  const job = (status: string) => ({id:'p1',action:'Vídeo',parameters:{},status:'processing',result:{jobId:'j1',job:{status}}});
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/a/messages') && init?.method === 'POST') return new Response(new ReadableStream({start(c) { controller = c; }}));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[job(++loads === 1 ? 'running' : 'done')]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await screen.findByText(/Vídeo/);
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pergunta'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(controller).toBeDefined());
  await waitFor(() => expect(loads).toBeGreaterThan(1), {timeout:5000});
  await waitFor(() => expect(screen.queryByText(/cancelamento desta geração/)).toBeNull());
  await act(async () => { controller.enqueue(new TextEncoder().encode('event: approval\ndata: {"id":"p2","action":"Outra ação","parameters":{},"status":"pending"}\n\n')); });
  expect(screen.queryByText(/cancelamento desta geração/)).toBeNull();
  await act(async () => { controller.enqueue(new TextEncoder().encode('event: done\ndata: {"message":{"content":"Resposta"}}\n\n')); controller.close(); });
}, 10000);

it('recupera o estado do servidor ao reabrir após falha da recuperação em segundo plano', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let loads = 0;
  let clientKey = '';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/a/messages') && init?.method === 'POST') { clientKey = JSON.parse(init.body as string).clientKey; return new Response(new ReadableStream({start(c) { controller = c; }})); }
    if (url.endsWith('/conversations/a')) {
      loads++;
      if (loads === 2) throw new Error('offline');
      return new Response(JSON.stringify({client_keys:loads === 1 ? [] : [clientKey],messages:loads === 1 ? [] : [{id:'saved',role:'assistant',content:'Resposta recuperada'}],approvals:[]}));
    }
    if (url.endsWith('/conversations/b')) return new Response(JSON.stringify({messages:[{id:'b1',role:'user',content:'Somente B'}],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pergunta A'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(controller).toBeDefined());
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await screen.findByText('Somente B');
  await act(async () => { controller.error(new Error('disconnected')); });
  await waitFor(() => expect(loads).toBe(2));
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  expect(await screen.findByText('Resposta recuperada')).toBeInTheDocument();
  expect(screen.getByLabelText('Mensagem')).toBeEnabled();
});

it('não substitui confirmação concluída por consulta iniciada antes dela', async () => {
  let resolvePoll!: (response: Response) => void;
  let loads = 0;
  const pending = {id:'p1',action:'Ação pendente',parameters:{},status:'pending'};
  const job = {id:'job',action:'Vídeo',parameters:{},status:'processing',result:{jobId:'j',job:{status:'running'}}};
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) {
      if (++loads === 1) return new Response(JSON.stringify({messages:[],approvals:[pending,job]}));
      return new Promise<Response>(resolve => { resolvePoll = resolve; });
    }
    if (url.endsWith('/approvals/p1/confirm')) return new Response(JSON.stringify({status:'completed',result:{}}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await screen.findByRole('button',{name:'Confirmar ação'});
  await waitFor(() => expect(resolvePoll).toBeDefined(), {timeout:5000});
  fireEvent.click(screen.getByRole('button',{name:'Confirmar ação'}));
  await screen.findByText('Status: Concluída');
  await act(async () => resolvePoll(new Response(JSON.stringify({messages:[],approvals:[pending,job]}))));
  expect(screen.getByText('Status: Concluída')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Confirmar ação'})).toBeNull();
}, 10000);

it('usa estado mais recente do servidor ao reabrir após recuperação bem-sucedida em segundo plano', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let loads = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/a/messages') && init?.method === 'POST') return new Response(new ReadableStream({start(c) { controller = c; }}));
    if (url.endsWith('/conversations/a')) {
      loads++;
      return new Response(JSON.stringify({messages:loads === 1 ? [] : [{id:'saved',role:'assistant',content:loads === 2 ? 'Estado antigo' : 'Estado atualizado'}],approvals:[]}));
    }
    if (url.endsWith('/conversations/b')) return new Response(JSON.stringify({messages:[{id:'b1',role:'user',content:'Somente B'}],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pergunta A'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(controller).toBeDefined());
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await screen.findByText('Somente B');
  await act(async () => controller.error(new Error('disconnected')));
  await waitFor(() => expect(loads).toBe(2));
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  expect(await screen.findByText('Estado atualizado')).toBeInTheDocument();
  expect(screen.queryByText('Estado antigo')).toBeNull();
});
