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
  let uploads = 0;
  let readsA = 0;
  const oldAttachment = {id:'271b73cd-07c8-45db-a271-e3f7b329c026',filename:'antigo.png',mimeType:'image/png',sizeBytes:5};
  const newAttachment = {id:'371b73cd-07c8-45db-a271-e3f7b329c026',filename:'novo.png',mimeType:'image/png',sizeBytes:5};
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]));
    if (url.endsWith('/attachments')) return new Response(JSON.stringify({attachments:[uploads++ === 0 ? oldAttachment : newAttachment]}));
    if (url.endsWith('/messages') && init?.method === 'POST') return new Promise<Response>((_, reject) => { fail = reject; });
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
  await act(async () => recover(new Response(JSON.stringify({messages:[{id:'saved',role:'user',content:'Texto antigo',attachments:[oldAttachment]}],approvals:[]}))));
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


// TODO: same-conversation concurrency is not implemented; do not mistake the different-conversation test for this requirement.
it.skip('TODO: permite dois envios na mesma conversa enquanto respostas chegam em ordem inversa (backend ainda retorna 409)', async () => {
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
