// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatPage } from './ChatPage';
vi.mock('../../lib/session-refresh', () => ({refreshSession: vi.fn()}));
vi.mock('./useChatPlans', () => ({useChatPlans: () => ({plans:[], errors:{}, error:null, busyPlanIds:[], refetch:vi.fn(), onAction:vi.fn(), onEdit:vi.fn(), onCompleteTask:vi.fn()})}));
beforeEach(() => { sessionStorage.clear(); localStorage.setItem('token','token'); });
it('apresenta cada mensagem ordenada no stream e ao reabrir sem duplicar', async () => {
  const answers = [{id:'m1',role:'assistant',content:'Primeira'}, {id:'m2',role:'assistant',content:'Segunda'}];
  let saved = false;
  let body: Record<string, unknown> = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') { body = JSON.parse(String(init.body)); saved = true; return new Response(`event: done\ndata: ${JSON.stringify({message:answers[1],messages:answers})}\n\n`); }
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:saved ? [{id:'u',role:'user',content:'Pergunta'}, ...answers] : [],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect((screen.getByLabelText('Mensagem') as HTMLInputElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Pergunta'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await screen.findByText('Primeira');
  await screen.findByText('Segunda');
  expect(body.responseCapabilities).toEqual(['multi_message_v1']);
  expect(Array.from(document.querySelectorAll('.ady-chat-message[data-role="assistant"]')).map(item => item.textContent)).toEqual(['AdyPrimeira','AdySegunda']);
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getAllByText('Primeira')).toHaveLength(1));
  expect(screen.getAllByText('Segunda')).toHaveLength(1);
});
it('mantém o grupo recuperado antes da próxima pergunta durante streams concorrentes', async () => {
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') return new Response(new ReadableStream({start(c) { controllers.push(c); }}));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify(++reads === 1 ? {messages:[],approvals:[]} : {messages:[{id:'u1',role:'user',content:'Pergunta 1'},{id:'m1',role:'assistant',content:'Parte 1'},{id:'m2',role:'assistant',content:'Parte 2'},{id:'u2',role:'user',content:'Pergunta 2'},{id:'m3',role:'assistant',content:'Resposta 2'}],approvals:[],response_runs:[{id:'r1',user_message_id:'u1',status:'completed'},{id:'r2',user_message_id:'u2',status:'completed'}]}));
    throw new Error(url);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  for (const text of ['Pergunta 1','Pergunta 2']) {
    fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:text}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue(''));
  }
  await waitFor(() => expect(controllers).toHaveLength(2));
  const enc = new TextEncoder();
  await act(async () => { controllers[0].enqueue(enc.encode('event: run\ndata: {"run_id":"r1","user_message_id":"u1"}\n\n')); controllers[1].enqueue(enc.encode('event: run\ndata: {"run_id":"r2","user_message_id":"u2"}\n\n')); });
  await act(async () => { controllers[1].enqueue(enc.encode('event: done\ndata: {"run_id":"r2","user_message_id":"u2","message":{"id":"m3","content":"Resposta 2"}}\n\n')); controllers[1].close(); });
  await act(async () => controllers[0].error(new Error('offline')));
  await screen.findByText('Parte 2');
  expect(Array.from(document.querySelectorAll('.ady-chat-message')).map(node => node.textContent)).toEqual(['VocêPergunta 1','AdyParte 1','AdyParte 2','VocêPergunta 2','AdyResposta 2']);
});
