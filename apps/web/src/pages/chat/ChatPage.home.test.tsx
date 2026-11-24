import './chat-websocket-test-mock';
/* # language: pt-BR
Funcionalidade: continuar um caminho da Home no chat
  Cenário: cada entrada abre pergunta sem restaurar conversa anterior nem enviar automaticamente
  Cenário: resposta cria conversa e avança com intenção segura
  Cenário: falha preserva seleção e não conta início
*/
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';
vi.mock('./useQuickActionContext', () => ({useQuickActionContext:() => ({tenantName:'Flores',city:'Recife'})}));
const captureEvent = vi.hoisted(() => vi.fn());
vi.mock('../../lib/posthog', () => ({captureEvent}));
let fail = false;
let streamFailure = false;
const fetchMock = vi.fn(async (url:string, init?:RequestInit) => {
  if (url.endsWith('/conversations') && init?.method === 'POST') return fail ? new Response('{}',{status:503}) : Response.json({id:'nova',title:'Nova'});
  if (url.endsWith('/messages')) return new Response(streamFailure
    ? 'event: token\ndata: {"content":"Resposta parcial"}\n\nevent: error\ndata: {"message":"Serviço indisponível"}\n\nevent: done\ndata: {}\n\n'
    : 'event: done\ndata: {"message":{"content":"Vamos continuar com uma escolha simples."}}\n\n');
  if (url.endsWith('/plans')) return Response.json({plans:[]});
  if (url.endsWith('/conversations/antiga')) return Response.json({messages:[{id:'m1',role:'user',content:'Conversa antiga'}]});
  return Response.json([{id:'antiga',title:'Histórico preservado'}]);
});
beforeEach(() => {
  fail=false; streamFailure=false; fetchMock.mockClear(); captureEvent.mockClear(); sessionStorage.clear();
  sessionStorage.setItem('ady-chat-current','antiga'); localStorage.setItem('token','sessao'); vi.stubGlobal('fetch',fetchMock);
});
afterEach(() => { window.history.replaceState({},'', '/'); });
const starts = [
  ['orientacao','Não sei por onde começar'], ['conteudo','Criar conteúdo para minhas redes'],
  ['semana','Planejar minha semana'], ['clientes','Atrair mais clientes'],
];
describe('entrada da Home', () => {
  it.each(starts)('inicia %s sem anexar mensagem à conversa anterior', async (id,label) => {
    window.history.replaceState({},'',`/chat?inicio=${id}`); render(<ChatPage/>);
    expect(await screen.findByRole('heading',{name:label})).toBeInTheDocument();
    await screen.findByRole('button',{name:'Histórico preservado'});
    expect(fetchMock.mock.calls.some(([,init]) => init?.method === 'POST')).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/antiga'))).toBe(false);
    fireEvent.click(screen.getByRole('group',{name:/\?/}).querySelector('button')!);
    await screen.findByText('Vamos continuar com uma escolha simples.');
    const messages = fetchMock.mock.calls.filter(([url]) => url.endsWith('/messages'));
    expect(messages).toHaveLength(1); expect(messages[0][0]).toContain('/nova/');
    expect(JSON.parse(messages[0][1]!.body as string).content).toContain('confirmação explícita');
    expect(captureEvent).toHaveBeenCalledWith('home_fluxo_iniciado',{fluxo:id});
    expect(captureEvent).toHaveBeenCalledWith('home_fluxo_avancou',{fluxo:id});
  });
  it('preserva resposta livre e seleção quando criar conversa falha', async () => {
    fail=true; window.history.replaceState({},'','/chat?inicio=conteudo'); render(<ChatPage/>);
    await screen.findByRole('heading',{name:'Criar conteúdo para minhas redes'});
    fireEvent.change(screen.getByRole('textbox',{name:'Mensagem'}),{target:{value:'Minha ideia'}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByText('Não foi possível iniciar a conversa.');
    expect(screen.getByRole('textbox',{name:'Mensagem'})).toHaveValue('Minha ideia');
    expect(captureEvent).not.toHaveBeenCalled();
  });
  it('entrada desconhecida mantém retomada comum sem telemetria da Home', async () => {
    window.history.replaceState({},'','/chat?inicio=invalido'); render(<ChatPage/>);
    await screen.findByText('Conversa antiga');
    expect(captureEvent).not.toHaveBeenCalled();
  });
  it('resposta parcial com erro não conta como avanço do fluxo', async () => {
    streamFailure=true; window.history.replaceState({},'','/chat?inicio=clientes'); render(<ChatPage/>);
    await screen.findByRole('heading',{name:'Atrair mais clientes'});
    fireEvent.click(screen.getByRole('button',{name:'Um produto',exact:true}));
    await screen.findByText('Serviço indisponível');
    expect(captureEvent).toHaveBeenCalledWith('home_fluxo_iniciado',{fluxo:'clientes'});
    expect(captureEvent).not.toHaveBeenCalledWith('home_fluxo_avancou',expect.anything());
  });
});
