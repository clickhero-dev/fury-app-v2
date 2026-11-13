// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatPage } from './ChatPage';
vi.mock('../../lib/session-refresh', () => ({refreshSession: vi.fn()}));
vi.mock('./useChatPlans', () => ({useChatPlans: () => ({plans:[], errors:{}, error:null, busyPlanIds:[], refetch:vi.fn(), onAction:vi.fn(), onEdit:vi.fn(), onCompleteTask:vi.fn()})}));
beforeEach(() => { sessionStorage.clear(); localStorage.setItem('token','token'); });
it('não exibe balão vazio quando o stream termina sem resposta', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') return new Response('event: done\ndata: {"message":{"content":""}}\n\n');
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Olá'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  expect(await screen.findByText(/Não foi possível concluir a resposta/)).toBeInTheDocument();
  expect(document.querySelectorAll('.ady-chat-message[data-role="assistant"]')).toHaveLength(0);
});

it('permite navegar e enviar duas perguntas enquanto respostas chegam em ordem inversa', async () => {
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') return new Response(new ReadableStream({start(c) { controllers.push(c); }}));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    if (url.endsWith('/conversations/b')) return new Response(JSON.stringify({messages:[{id:'b1',role:'user',content:'Somente B'}],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pergunta 1'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(controllers).toHaveLength(1));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue(''));
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pergunta 2'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(controllers).toHaveLength(2));
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  expect(await screen.findByText('Somente B')).toBeInTheDocument();
  const enc = new TextEncoder();
  await act(async () => { controllers[1].enqueue(enc.encode('event: done\ndata: {"message":{"content":"Resposta 2"}}\n\n')); controllers[1].close(); controllers[0].enqueue(enc.encode('event: done\ndata: {"message":{"content":"Resposta 1"}}\n\n')); controllers[0].close(); });
  expect(screen.queryByText('Resposta 1')).toBeNull();
  expect(screen.queryByText('Resposta 2')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  expect(await screen.findByText('Resposta 1')).toBeInTheDocument();
  expect(screen.getByText('Resposta 2')).toBeInTheDocument();
});
