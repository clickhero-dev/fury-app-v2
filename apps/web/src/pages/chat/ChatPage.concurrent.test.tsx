// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatPage } from './ChatPage';
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);
vi.mock('../../lib/session-refresh', () => ({refreshSession: vi.fn()}));
vi.mock('./useChatPlans', () => ({useChatPlans: () => ({plans:[], errors:{}, error:null, busyPlanIds:[], refetch:vi.fn(), onAction:vi.fn(), onEdit:vi.fn(), onCompleteTask:vi.fn()})}));
beforeEach(() => { sessionStorage.clear(); localStorage.setItem('token','token'); });
it.each(['open', 'restore'])('recupera rascunho inicial ao criar após %s sem sobrescrever conversa existente', async mode => {
  let finishHistory!: (response: Response) => void;
  if (mode === 'restore') sessionStorage.setItem('ady-chat-current', 'a');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations') && init?.method === 'POST') return new Response(JSON.stringify({id:'new',title:'Criada'}));
    if (url.endsWith('/conversations')) return new Promise<Response>(resolve => { finishHistory = resolve; });
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Rascunho inicial'}});
  await act(async () => finishHistory(new Response(JSON.stringify([{id:'a',title:'Conversa A'}]))));
  if (mode === 'open') fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByRole('button',{name:'Conversa A'})).toHaveAttribute('aria-current','page'));
  expect(screen.getByLabelText('Mensagem')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Rascunho A'}});
  fireEvent.click(screen.getByRole('button',{name:'Nova conversa'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho inicial'));
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho A'));
});
it('isola e restaura o texto e anexo de cada conversa ao navegar', async () => {
  const attachment = {id:'271b73cd-07c8-45db-a271-e3f7b329c026',filename:'foto.png',mimeType:'image/png',sizeBytes:5};
  URL.createObjectURL = vi.fn(() => 'blob:draft'); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/attachments')) return new Response(JSON.stringify({attachments:[attachment]}));
    if (url.endsWith('/conversations/a') || url.endsWith('/conversations/b')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho A'}});
  fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[new File(['image'],'foto.png',{type:'image/png'})]}});
  await screen.findByText('Pronto para enviar');
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  expect(screen.getByLabelText('Mensagem')).toHaveValue('');
  expect(screen.queryByText('Pronto para enviar')).toBeNull();
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho B'}});
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho A'));
  expect(screen.getByText('Pronto para enviar')).toBeInTheDocument();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});
it('preserva anexo e texto se a criação de nova conversa falha', async () => {
  const attachment = {id:'271b73cd-07c8-45db-a271-e3f7b329c026',filename:'foto.png',mimeType:'image/png',sizeBytes:5};
  URL.createObjectURL = vi.fn(() => 'blob:draft'); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations') && init?.method === 'POST') throw new Error('offline');
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/attachments')) return new Response(JSON.stringify({attachments:[attachment]}));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho A'}});
  fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[new File(['image'],'foto.png',{type:'image/png'})]}});
  await screen.findByText('Pronto para enviar');
  fireEvent.click(screen.getByRole('button',{name:'Nova conversa'}));
  await screen.findByText('Não foi possível iniciar a conversa.');
  expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho A');
  expect(screen.getByText('Pronto para enviar')).toBeInTheDocument();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});
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

it('limpa rascunho enviado ao trocar de conversa sem apagar o novo rascunho', async () => {
  let accept!: (response: Response) => void;
  const attachment = {id:'271b73cd-07c8-45db-a271-e3f7b329c026',filename:'foto.png',mimeType:'image/png',sizeBytes:5};
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/attachments')) return new Response(JSON.stringify({attachments:[attachment]}));
    if (url.endsWith('/messages') && init?.method === 'POST') return new Promise<Response>(resolve => { accept = resolve; });
    if (url.endsWith('/conversations/a') || url.endsWith('/conversations/b')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[new File(['image'],'foto.png',{type:'image/png'})]}});
  await screen.findByText('Pronto para enviar');
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Texto A'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(accept).toBeDefined());
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  expect(screen.getByLabelText('Mensagem')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho B'}});
  fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[new File(['image'],'foto.png',{type:'image/png'})]}});
  await screen.findByText('Pronto para enviar');
  await act(async () => accept(new Response('event: done\ndata: {"message":{"content":"Resposta A"}}\n\n')));
  expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho B');
  expect(screen.getByText('Pronto para enviar')).toBeInTheDocument();
});

it('preserva texto e anexo quando a abertura de outra conversa falha', async () => {
  const attachment = {id:'271b73cd-07c8-45db-a271-e3f7b329c026',filename:'foto.png',mimeType:'image/png',sizeBytes:5};
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/attachments')) return new Response(JSON.stringify({attachments:[attachment]}));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    if (url.endsWith('/conversations/b')) throw new Error('offline');
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho'}});
  fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[new File(['image'],'foto.png',{type:'image/png'})]}});
  await screen.findByText('Pronto para enviar');
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  expect(await screen.findByText('Não foi possível abrir a conversa.')).toBeInTheDocument();
  expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho');
  expect(screen.getByText('Pronto para enviar')).toBeInTheDocument();
});

it('limpa envio aceito após tentativa falha de trocar de conversa', async () => {
  let accept!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') return new Promise<Response>(resolve => { accept = resolve; });
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    if (url.endsWith('/conversations/b')) throw new Error('offline');
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Texto enviado'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(accept).toBeDefined());
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await screen.findByText('Não foi possível abrir a conversa.');
  await act(async () => accept(new Response('event: done\ndata: {"message":{"content":"Resposta"}}\n\n')));
  expect(screen.getByLabelText('Mensagem')).toHaveValue('');
});

it('limpa o rascunho aceito mesmo após clicar na conversa atual', async () => {
  let accept!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') return new Promise<Response>(resolve => { accept = resolve; });
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Texto enviado'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(accept).toBeDefined());
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  await act(async () => accept(new Response('event: done\ndata: {"message":{"content":"Resposta"}}\n\n')));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue(''));
});

it('não apaga rascunho mais recente ao retornar antes da aceitação anterior', async () => {
  let accept!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') return new Promise<Response>(resolve => { accept = resolve; });
    if (url.endsWith('/conversations/a') || url.endsWith('/conversations/b')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Texto A'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(accept).toBeDefined());
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho novo'}});
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeDisabled());
  await act(async () => accept(new Response('event: done\ndata: {"message":{"content":"Resposta A"}}\n\n')));
  expect(screen.getByLabelText('Mensagem')).toHaveValue('');
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho novo'));
});

it('preserva novo rascunho ao recuperar envio com anexo após sair e voltar', async () => {
  let fail!: (error: Error) => void;
  let recover!: (response: Response) => void;
  let clientKey = '';
  let uploads = 0;
  let readsA = 0;
  const oldAttachment = {id:'271b73cd-07c8-45db-a271-e3f7b329c026',filename:'antigo.png',mimeType:'image/png',sizeBytes:5};
  const newAttachment = {id:'371b73cd-07c8-45db-a271-e3f7b329c026',filename:'novo.png',mimeType:'image/png',sizeBytes:5};
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/attachments')) return new Response(JSON.stringify({attachments:[uploads++ === 0 ? oldAttachment : newAttachment]}));
    if (url.endsWith('/messages') && init?.method === 'POST') { clientKey = JSON.parse(String(init.body)).clientKey; return new Promise<Response>((_, reject) => { fail = reject; }); }
    if (url.endsWith('/conversations/a')) {
      if (++readsA === 2) return new Promise<Response>(resolve => { recover = resolve; });
      return new Response(JSON.stringify({messages:[],approvals:[]}));
    }
    if (url.endsWith('/conversations/b')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[new File(['image'],'antigo.png',{type:'image/png'})]}});
  await screen.findByText('Pronto para enviar');
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Texto antigo'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(fail).toBeDefined());
  await act(async () => fail(new Error('offline')));
  await waitFor(() => expect(recover).toBeDefined());
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho novo'}});
  fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[new File(['image'],'novo.png',{type:'image/png'})]}});
  await screen.findByText('Pronto para enviar');
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeDisabled());
  await act(async () => recover(new Response(JSON.stringify({messages:[{id:'saved',role:'user',content:'Texto antigo',attachments:[oldAttachment]}],approvals:[],response_runs:[{id:'r1',user_message_id:'saved',client_key:clientKey,status:'failed'}]}))));
  expect(screen.getByLabelText('Mensagem')).toHaveValue('');
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho novo'));
});

it('permite envios em conversas diferentes enquanto respostas chegam em ordem inversa', async () => {
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
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  expect(await screen.findByText('Somente B')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pergunta 2'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(controllers).toHaveLength(2));
  const enc = new TextEncoder();
  await act(async () => { controllers[1].enqueue(enc.encode('event: done\ndata: {"message":{"content":"Resposta 2"}}\n\n')); controllers[1].close(); controllers[0].enqueue(enc.encode('event: done\ndata: {"message":{"content":"Resposta 1"}}\n\n')); controllers[0].close(); });
  expect(screen.queryByText('Resposta 1')).toBeNull();
  expect(screen.getByText('Resposta 2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Conversa A'}));
  expect(await screen.findByText('Resposta 1')).toBeInTheDocument();
  expect(screen.queryByText('Resposta 2')).toBeNull();
});


it('permite dois envios na mesma conversa enquanto respostas chegam em ordem inversa', async () => {
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
  expect(Array.from(document.querySelectorAll('.ady-chat-message')).map(node => node.textContent)).toEqual([
    expect.stringContaining('Pergunta 1'), expect.stringContaining('Resposta 1'),
    expect.stringContaining('Pergunta 2'), expect.stringContaining('Resposta 2'),
  ]);
});

it('mantém o outro stream e o rascunho durante recuperação de envio interrompido', async () => {
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') return new Response(new ReadableStream({start(c) { controllers.push(c); }}));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Primeira'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue(''));
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Segunda'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(controllers).toHaveLength(2));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue(''));
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho novo'}});
  await act(async () => controllers[0].error(new Error('offline')));
  expect(await screen.findByText(/A conexão foi interrompida/)).toBeInTheDocument();
  await act(async () => { controllers[1].enqueue(new TextEncoder().encode('event: done\ndata: {"message":{"content":"Resposta segunda"}}\n\n')); controllers[1].close(); });
  expect(screen.getByText('Segunda')).toBeInTheDocument();
  expect(screen.getByText('Resposta segunda')).toBeInTheDocument();
  expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho novo');
});

it('libera o envio após rejeição definitiva de retomada por compactação', async () => {
  const saved = {messages:[{id:'u1',role:'user',content:'Primeira'}],approvals:[],response_runs:[{id:'r1',user_message_id:'u1',status:'failed'}]};
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.includes('/retry?')) return new Response(JSON.stringify({detail:'Não é possível retentar após a compactação desta conversa.',code:'retry_compacted'}),{status:409});
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify(saved));
    throw new Error(url);
  }));
  render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  fireEvent.click(await screen.findByRole('button',{name:/Retomar resposta/}));
  await screen.findByText(/compactação/);
  expect(screen.queryByRole('button',{name:'Reenviar envio pendente'})).toBeNull();
  expect(screen.getByLabelText('Mensagem')).toBeEnabled();
});

it('libera retomada pendente rejeitada por compactação ao reenviar a mesma chave', async () => {
  let calls = 0; const bodies: string[] = [];
  const saved = {messages:[{id:'u1',role:'user',content:'Primeira'}],approvals:[],response_runs:[{id:'r1',user_message_id:'u1',status:'failed'}]};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.includes('/retry?')) { bodies.push(String(init?.body)); if (++calls === 1) throw new Error('offline'); return new Response(JSON.stringify({code:'retry_compacted'}),{status:409}); }
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify(saved));
    throw new Error(url);
  }));
  render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  fireEvent.click(await screen.findByRole('button',{name:/Retomar resposta/}));
  fireEvent.click(await screen.findByRole('button',{name:'Reenviar envio pendente'}));
  await screen.findByText(/compactação/);
  expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
  expect(screen.queryByRole('button',{name:'Reenviar envio pendente'})).toBeNull();
  expect(screen.getByLabelText('Mensagem')).toBeEnabled();
});

it('mantém o bloqueio quando conflito duplicado ainda não aparece no estado recuperado', async () => {
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[],response_runs:[]}));
    if (url.endsWith('/messages')) { if (++calls === 1) throw new Error('offline'); return new Response(JSON.stringify({detail:'Envio já registrado.'}),{status:409}); }
    throw new Error(url);
  }));
  render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pedido'}}); fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  fireEvent.click(await screen.findByRole('button',{name:'Reenviar envio pendente'}));
  await waitFor(() => expect(calls).toBe(2));
  await waitFor(() => expect(screen.getByRole('button',{name:'Reenviar envio pendente'})).toBeEnabled());
  expect(screen.getByLabelText('Mensagem')).toBeDisabled();
});

it('retoma cada resposta falha pelo ID retornado pelo servidor', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.includes('/retry?')) return new Response('event: done\ndata: {"run_id":"r3","user_message_id":"u1","message":{"id":"m1","content":"Retomada"}}\n\n');
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[{id:'u1',role:'user',content:'Primeira'},{id:'u2',role:'user',content:'Segunda'}],approvals:[],response_run:{status:'completed'},response_runs:[{id:'r2',user_message_id:'u2',status:'failed'},{id:'r1',user_message_id:'u1',status:'interrupted'},{id:'old',user_message_id:'u1',status:'failed'}]}));
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock); render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  const buttons = await screen.findAllByRole('button',{name:/Retomar resposta/});
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[1]);
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/retry?run_id=r1'))).toBe(true));
});

it('correlaciona mensagens otimistas com IDs persistidos na recuperação concorrente', async () => {
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = []; let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') return new Response(new ReadableStream({start(c) { controllers.push(c); }}));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify(++reads === 1 ? {messages:[],approvals:[]} : {messages:[{id:'u1',role:'user',content:'Mesmo texto'},{id:'u2',role:'user',content:'Mesmo texto'}],approvals:[],response_runs:[{id:'r1',user_message_id:'u1',status:'failed'},{id:'r2',user_message_id:'u2',status:'running'}]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  for (let i=0;i<2;i++) { fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Mesmo texto'}}); fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'})); await waitFor(() => expect(controllers).toHaveLength(i+1)); await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue('')); }
  const enc = new TextEncoder();
  await act(async () => { controllers[0].enqueue(enc.encode('event: run\ndata: {"run_id":"r1","user_message_id":"u1"}\n\n')); controllers[1].enqueue(enc.encode('event: run\ndata: {"run_id":"r2","user_message_id":"u2"}\n\n')); });
  await act(async () => controllers[0].error(new Error('offline')));
  await screen.findByText(/A conexão foi interrompida/);
  expect(screen.getAllByText('Mesmo texto')).toHaveLength(2);
  await act(async () => { controllers[1].enqueue(enc.encode('event: done\ndata: {"run_id":"r2","user_message_id":"u2","message":{"id":"m2","content":"Resposta"}}\n\n')); controllers[1].close(); });
  expect(await screen.findByRole('button',{name:/Retomar resposta/})).toBeInTheDocument();
});

it('não duplica mensagem sem ID de stream ao recuperar envios concorrentes iguais', async () => {
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = []; let reads = 0; const keys: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') { keys.push(JSON.parse(String(init.body)).clientKey); return new Response(new ReadableStream({start(c) { controllers.push(c); }})); }
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify(++reads === 1 ? {messages:[],approvals:[]} : {messages:[{id:'u1',role:'user',content:'Mesmo texto'},{id:'u2',role:'user',content:'Mesmo texto'}],approvals:[],response_runs:[{id:'r1',user_message_id:'u1',client_key:keys[0],status:'failed'},{id:'r2',user_message_id:'u2',client_key:keys[1],status:'running'}]}));
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock); render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  for (let i=0;i<2;i++) { fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Mesmo texto'}}); fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'})); await waitFor(() => expect(controllers).toHaveLength(i+1)); await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue('')); }
  await act(async () => controllers[1].enqueue(new TextEncoder().encode('event: run\ndata: {"run_id":"r2","user_message_id":"u2"}\n\n')));
  await act(async () => controllers[0].error(new Error('offline')));
  await screen.findByText(/A conexão foi interrompida/);
  expect(screen.getAllByText('Mesmo texto')).toHaveLength(2);
  expect(fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/messages') && init?.method === 'POST')).toHaveLength(2);
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/retry'))).toBe(false);
  await act(async () => { controllers[1].enqueue(new TextEncoder().encode('event: done\ndata: {"run_id":"r2","user_message_id":"u2","message":{"id":"m2","content":"Resposta"}}\n\n')); controllers[1].close(); });
});

it('revoga previews de todas as conversas ao desmontar', async () => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++n}`); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/attachments')) return new Response(JSON.stringify({attachments:[{id:crypto.randomUUID(),filename:'foto.png',mimeType:'image/png',sizeBytes:5}]}));
    return new Response(JSON.stringify({messages:[],approvals:[]}));
  }));
  const view = render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[new File(['image'],'foto.png',{type:'image/png'})]}});
  await screen.findByText('Pronto para enviar');
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[new File(['image'],'foto.png',{type:'image/png'})]}});
  await screen.findByText('Pronto para enviar');
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2');
});

it('reconcilia envio sem primeiro evento apenas pela chave persistida', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>; let key = ''; let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/messages') && init?.method === 'POST') { key = JSON.parse(String(init.body)).clientKey; return new Response(new ReadableStream({start(c) { controller = c; }})); }
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify(++reads === 1 ? {messages:[],approvals:[]} : {messages:[{id:'u1',role:'user',content:'Mesmo texto'}],approvals:[],response_runs:[{id:'r1',user_message_id:'u1',client_key:key,status:'failed'}]}));
    throw new Error(`unexpected ${url}`);
  }));
  render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Mesmo texto'}}); fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await waitFor(() => expect(controller).toBeDefined());
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
  await act(async () => controller.error(new Error('offline')));
  await screen.findByText(/A conexão foi interrompida/);
  expect(screen.getAllByText('Mesmo texto')).toHaveLength(1);
});

it('reenvia envio não visto com chave e corpo idênticos após recarregar', async () => {
  const bodies: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[],response_runs:[]}));
    if (url.endsWith('/messages') && init?.method === 'POST') { bodies.push(String(init.body)); if (bodies.length === 1) throw new Error('offline'); return new Response('event: done\ndata: {"run_id":"r","user_message_id":"u","message":{"content":"Resposta"}}\n\n'); }
    throw new Error(url);
  }));
  const view = render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Texto original'}}); fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await screen.findByText(/A conexão foi interrompida/); view.unmount();
  render(<ChatPage/>); await screen.findByRole('button',{name:'Reenviar envio pendente'});
  fireEvent.click(screen.getByRole('button',{name:'Reenviar envio pendente'}));
  await waitFor(() => expect(bodies).toHaveLength(2)); expect(bodies[1]).toBe(bodies[0]);
});

it('não envia quando armazenamento de recuperação está indisponível', async () => {
  const fetchMock = vi.fn(async (url: string) => { if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}])); if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]})); throw new Error(url); });
  vi.stubGlobal('fetch', fetchMock); render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'})); await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Texto'}});
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage'); });
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await screen.findByText(/Não foi possível salvar o envio com segurança/);
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/messages'))).toBe(false);
  expect(screen.getByLabelText('Mensagem')).toHaveValue('Texto'); spy.mockRestore();
});

it.each(['original', 'resend'])('reconcilia aceitação tardia quando %s vence sem duplicar efeitos', async winner => {
  const bodies: string[] = []; let reads = 0; let effects = 0; let accepted = false;
  let finishResend!: (response: Response) => void;
  const saved = () => ({messages:[{id:'u',role:'user',content:'Pedido único'},{id:'m',role:'assistant',content:'Resposta única'}],approvals:[],client_keys:[JSON.parse(bodies[0]).clientKey],response_runs:[{id:'r',user_message_id:'u',client_key:JSON.parse(bodies[0]).clientKey,status:'completed'}]});
  const accept = () => { if (accepted) return false; accepted = true; effects++; return true; };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify(++reads <= 2 ? {messages:[],approvals:[],response_runs:[]} : saved()));
    if (url.endsWith('/messages') && init?.method === 'POST') {
      bodies.push(String(init.body));
      if (bodies.length === 1) throw new Error('conexão perdida antes de entrega');
      return new Promise<Response>(resolve => { finishResend = resolve; });
    }
    throw new Error(url);
  }));
  render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pedido único'}}); fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  fireEvent.click(await screen.findByRole('button',{name:'Reenviar envio pendente'}));
  await waitFor(() => expect(bodies).toHaveLength(2)); expect(bodies[1]).toBe(bodies[0]);
  if (winner === 'original') {
    expect(accept()).toBe(true);
    await act(async () => finishResend(new Response(JSON.stringify({detail:'Envio já registrado. Atualize a conversa.'}),{status:409})));
  } else {
    expect(accept()).toBe(true);
    await act(async () => finishResend(new Response('event: done\ndata: {"run_id":"r","user_message_id":"u","message":{"id":"m","content":"Resposta única"}}\n\n')));
    expect(accept()).toBe(false); // original chega ao backend depois do reenvio
  }
  await screen.findByText('Resposta única');
  expect(screen.getAllByText('Pedido único')).toHaveLength(1);
  expect(screen.getAllByText('Resposta única')).toHaveLength(1);
  expect(effects).toBe(1);
  await waitFor(() => expect(screen.queryByRole('button',{name:'Reenviar envio pendente'})).toBeNull());
});

it('recupera envio aceito cuja resposta nunca chegou após reenvio receber 409', async () => {
  const bodies: string[] = []; let reads = 0; let effects = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) {
      if (++reads <= 2) return new Response(JSON.stringify({messages:[],approvals:[],response_runs:[]}));
      return new Response(JSON.stringify({messages:[{id:'u',role:'user',content:'Pedido aceito'},{id:'m',role:'assistant',content:'Resposta salva'}],approvals:[],client_keys:[JSON.parse(bodies[0]).clientKey],response_runs:[{id:'r',user_message_id:'u',client_key:JSON.parse(bodies[0]).clientKey,status:'completed'}]}));
    }
    if (url.endsWith('/messages') && init?.method === 'POST') {
      bodies.push(String(init.body));
      if (bodies.length === 1) { effects++; throw new Error('resposta perdida'); }
      return new Response(JSON.stringify({detail:'Envio já registrado. Atualize a conversa.'}),{status:409});
    }
    throw new Error(url);
  }));
  render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pedido aceito'}}); fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  fireEvent.click(await screen.findByRole('button',{name:'Reenviar envio pendente'}));
  await screen.findByText('Resposta salva');
  expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]); expect(effects).toBe(1);
  expect(screen.getAllByText('Pedido aceito')).toHaveLength(1);
  expect(screen.getAllByText('Resposta salva')).toHaveLength(1);
  await waitFor(() => expect(screen.queryByRole('button',{name:'Reenviar envio pendente'})).toBeNull());
});

it('não envia se o armazenamento descarta silenciosamente o corpo de recuperação', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[]}));
    throw new Error(url);
  });
  vi.stubGlobal('fetch', fetchMock); render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  const original = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this: Storage, key, value) {
    if (key.includes('payload')) return;
    return original.call(this, key, value);
  });
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pedido seguro'}}); fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  await screen.findByText(/Não foi possível salvar o envio com segurança/);
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/messages'))).toBe(false);
  expect(screen.getByLabelText('Mensagem')).toHaveValue('Pedido seguro');
  spy.mockRestore();
});

it('não reenvia nem perde envio pendente quando persistência fica indisponível', async () => {
  const bodies: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'}]));
    if (url.endsWith('/conversations/a')) return new Response(JSON.stringify({messages:[],approvals:[],response_runs:[]}));
    if (url.endsWith('/messages') && init?.method === 'POST') { bodies.push(String(init.body)); throw new Error('offline'); }
    throw new Error(url);
  }));
  render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pedido pendente'}}); fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
  const retry = await screen.findByRole('button',{name:'Reenviar envio pendente'});
  const spy = vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('storage'); });
  fireEvent.click(retry);
  await screen.findByText(/Não foi possível salvar o envio com segurança/);
  expect(bodies).toHaveLength(1);
  expect(screen.getByRole('button',{name:'Reenviar envio pendente'})).toBeInTheDocument();
  spy.mockRestore();
});
