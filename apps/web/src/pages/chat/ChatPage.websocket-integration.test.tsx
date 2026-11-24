import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatPage } from './ChatPage';

vi.mock('../../lib/session-refresh', () => ({refreshSession: vi.fn()}));
vi.mock('./useChatPlans', () => ({useChatPlans: () => ({plans:[], errors:{}, error:null, busyPlanIds:[], refetch:vi.fn()})}));
class MockSocket {
  static instances: MockSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: {data:string}) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn(); close = vi.fn();
  constructor(public url:string) { MockSocket.instances.push(this); }
  emit(event:string, data:object = {}) { this.onmessage?.({data:JSON.stringify({event,data})}); }
}
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); localStorage.setItem('token','token'); vi.stubEnv('VITE_CHAT_WS_URL','wss://chat.example/ws'); vi.stubGlobal('WebSocket',MockSocket); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); MockSocket.instances = []; });

it('envia seleção pelo socket uma única vez, após ack e com todos os eventos', async () => {
  const clarify = {id:'clar',run_id:'run',message_id:'m',question:'Qual opção?',choices:['Um','Dois'],selected_index:null};
  const fetcher = vi.fn(async (url:string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[{id:'m',role:'assistant',content:'Escolha'}],clarifications:[clarify],approvals:[]}));
    if (url.endsWith('/websocket-ticket')) return new Response('{"ticket":"ticket-1"}');
    throw new Error(url);
  });
  vi.stubGlobal('fetch',fetcher); render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  const choice = await screen.findByRole('button',{name:'Dois'});
  fireEvent.click(choice); fireEvent.click(choice);
  await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
  const socket = MockSocket.instances[0];
  await act(async () => { socket.onopen?.(); });
  const frame = JSON.parse(socket.send.mock.calls[0][0]);
  expect(frame.path).toBe('/conversations/a/clarifications/clar/answer');
  expect(frame.body).toMatchObject({choiceIndex:1,responseCapabilities:['multi_message_v1'],clientKey:expect.any(String)});
  expect(choice).not.toHaveAttribute('aria-pressed','true');
  await act(async () => { socket.emit('ack'); socket.emit('done',{message:{id:'r',role:'assistant',content:'Entendi'}}); socket.emit('title',{id:'a',title:'Título novo'}); socket.emit('end'); });
  expect(await screen.findByText('Entendi')).toBeInTheDocument();
  expect(await screen.findByRole('button',{name:'Título novo'})).toBeInTheDocument();
  expect(choice).toHaveAttribute('aria-pressed','true');
  expect(socket.send).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/answer'))).toHaveLength(0);
});

it('timeout após envio reconcilia e o reenvio manual usa o mesmo clientKey', async () => {
  let reads = 0;
  let expire: (() => void) | undefined;
  const originalTimeout = globalThis.setTimeout;
  const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 15_000 && typeof handler === 'function') expire = handler as () => void;
    return originalTimeout(handler, delay, ...args);
  }) as typeof setTimeout);
  const fetcher = vi.fn(async (url:string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) { reads++; return new Response(JSON.stringify({messages:[],approvals:[],response_runs:[],client_keys:[]})); }
    if (url.endsWith('/websocket-ticket')) return new Response('{"ticket":"ticket-1"}');
    throw new Error(url);
  });
  vi.stubGlobal('fetch',fetcher); render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await screen.findByRole('textbox',{name:'Mensagem'});
  fireEvent.change(screen.getByRole('textbox',{name:'Mensagem'}),{target:{value:'Olá'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
  const first = MockSocket.instances[0];
  await act(async () => { first.onopen?.(); expire?.(); });
  expect(await screen.findByRole('button',{name:'Reenviar envio pendente'})).toBeInTheDocument();
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(MockSocket.instances).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Reenviar envio pendente'}));
  await waitFor(() => expect(MockSocket.instances).toHaveLength(2));
  const second = MockSocket.instances[1];
  await act(async () => { second.onopen?.(); });
  expect(JSON.parse(second.send.mock.calls[0][0]).body.clientKey).toBe(JSON.parse(first.send.mock.calls[0][0]).body.clientKey);
  await act(async () => { second.emit('ack'); second.emit('done',{run_id:'run',user_message_id:'user',message:{id:'reply',role:'assistant',content:'Resposta'}}); second.emit('end'); });
  expect(await screen.findByText('Resposta')).toBeInTheDocument();
  expect(screen.getAllByText('Olá')).toHaveLength(1);
  timeoutSpy.mockRestore();
});

it('inatividade após ack reconcilia o resultado persistido sem duplicar nem reenviar', async () => {
  let expire: (() => void) | undefined;
  let saved = false; let clientKey = '';
  const originalTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 45_000 && typeof handler === 'function') expire = handler as () => void;
    return originalTimeout(handler, delay, ...args);
  }) as typeof setTimeout);
  const fetcher = vi.fn(async (url:string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify(saved ? {
      messages:[{id:'user',role:'user',content:'Olá'},{id:'reply',role:'assistant',content:'Resposta persistida'}], approvals:[],
      response_runs:[{id:'run',user_message_id:'user',status:'completed',client_key:clientKey}], client_keys:[clientKey],
    } : {messages:[],approvals:[],response_runs:[],client_keys:[]}));
    if (url.endsWith('/websocket-ticket')) return new Response('{"ticket":"ticket-1"}');
    throw new Error(url);
  });
  vi.stubGlobal('fetch',fetcher); render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  fireEvent.change(await screen.findByRole('textbox',{name:'Mensagem'}),{target:{value:'Olá'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
  const socket = MockSocket.instances[0];
  await act(async () => { socket.onopen?.(); clientKey = JSON.parse(socket.send.mock.calls[0][0]).body.clientKey; socket.emit('ack'); });
  expect(expire).toBeDefined(); saved = true;
  await act(async () => { expire?.(); });
  expect(await screen.findByText('Resposta persistida')).toBeInTheDocument();
  expect(screen.getAllByText('Olá')).toHaveLength(1);
  expect(MockSocket.instances).toHaveLength(1); expect(socket.send).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button',{name:'Reenviar envio pendente'})).not.toBeInTheDocument();
});
