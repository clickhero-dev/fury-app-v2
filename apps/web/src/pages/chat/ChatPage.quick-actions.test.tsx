import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';
vi.mock('./useQuickActionContext', () => ({useQuickActionContext:() => ({tenantName:'Flores da Ana',city:'Recife'})}));
const nextStep = 'Qual duração você prefere para o Reels?';
function setup({existing = true, fail = false} = {}) {
  const fetchMock = vi.fn(async (url:string, init?:RequestInit) => {
    if (url.endsWith('/conversations') && init?.method === 'POST') return fail ? new Response('{}',{status:503}) : Response.json({id:existing ? 'c3' : 'c1',title:'Nova'});
    if (url.endsWith('/messages')) return new Response(`event: done\ndata: ${JSON.stringify({message:{content:nextStep}})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});
    if (url.endsWith('/conversations/c1')) return Response.json({id:'c1',messages:[],approvals:[]});
    if (url.endsWith('/plans')) return Response.json({plans:[]});
    return Response.json(existing ? [{id:'c1',title:'Conversa atual'}] : []);
  });
  vi.stubGlobal('fetch',fetchMock); render(<ChatPage/>);
  return fetchMock;
}
const posts = (mock:ReturnType<typeof setup>) => mock.mock.calls.filter(([,init]) => init?.method === 'POST');
beforeEach(() => {sessionStorage.clear(); localStorage.setItem('token','test');});
describe('Funcionalidade: responder ação rápida pelo compositor único', () => {
  it('Dado conversa atual Quando seleciona sugestão duas vezes Então envia uma vez e recebe próximo passo sem executar ação', async () => {
    const mock = setup();
    fireEvent.click(await screen.findByRole('button',{name:'Conversa atual',exact:true}));
    await waitFor(() => expect(screen.getByRole('textbox',{name:'Mensagem',exact:true})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Criar Reels para o Instagram',exact:true}));
    expect(within(document.querySelector('.ady-chat-main') as HTMLElement).getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('heading',{name:'Como posso ajudar?'})).not.toBeInTheDocument();
    const option = screen.getByRole('button',{name:'Apresentar Flores da Ana para atrair clientes em Recife'});
    fireEvent.click(option); fireEvent.click(option);
    await screen.findByText(nextStep);
    expect(posts(mock)).toHaveLength(1); expect(posts(mock)[0][0]).toContain('/conversations/c1/messages');
    const body = JSON.parse(posts(mock)[0][1]!.body as string);
    expect(body.content).toContain('confirmação explícita'); expect(body.content).toContain('Reels');
  });
  it('Dado atalho aberto Quando envia resposta livre Então inclui ação e limpa somente o rascunho aceito', async () => {
    const mock = setup({existing:false});
    await waitFor(() => expect(screen.getByRole('textbox',{name:'Mensagem',exact:true})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Criar Reels para o Instagram',exact:true}));
    const input = screen.getByRole('textbox',{name:'Mensagem',exact:true});
    fireEvent.change(input,{target:{value:'Quero mostrar os arranjos de casamento'}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByText(nextStep);
    const sends = posts(mock).filter(([url]) => url.endsWith('/messages'));
    expect(sends).toHaveLength(1);
    expect(JSON.parse(sends[0][1]!.body as string).content).toContain('Reels para o Instagram em formato vertical');
    expect(JSON.parse(sends[0][1]!.body as string).content).toContain('arranjos de casamento');
    expect(input).toHaveValue('');
  });
  it('Dado falha ao criar conversa Quando responde Então mantém rascunho e ação para tentar novamente', async () => {
    const mock = setup({existing:false,fail:true});
    await waitFor(() => expect(screen.getByRole('textbox',{name:'Mensagem',exact:true})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Criar Reels para o Instagram',exact:true}));
    const input = screen.getByRole('textbox',{name:'Mensagem',exact:true});
    fireEvent.change(input,{target:{value:'Bastidores da loja'}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByText('Não foi possível iniciar a conversa.');
    expect(input).toHaveValue('Bastidores da loja');
    expect(screen.getByRole('heading',{name:'Criar Reels para o Instagram'})).toBeInTheDocument();
    expect(posts(mock)).toHaveLength(1);
  });
  it('Dado envio incerto Quando reenvia Então reutiliza payload e chave e limpa a resposta livre aceita', async () => {
    let attempts = 0; const bodies:string[] = [];
    const mock = setup();
    mock.mockImplementation(async (url:string,init?:RequestInit) => {
      if (url.endsWith('/messages')) {
        bodies.push(String(init?.body));
        if (++attempts === 1) throw new Error('offline');
        return new Response(`event: done\ndata: ${JSON.stringify({message:{content:nextStep}})}\n\n`);
      }
      if (url.endsWith('/conversations/c1')) return Response.json({messages:[],approvals:[],response_runs:[]});
      if (url.endsWith('/plans')) return Response.json({plans:[]});
      return Response.json([{id:'c1',title:'Conversa atual'}]);
    });
    fireEvent.click(await screen.findByRole('button',{name:'Conversa atual',exact:true}));
    await waitFor(() => expect(screen.getByRole('textbox',{name:'Mensagem',exact:true})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Criar Reels para o Instagram',exact:true}));
    const input = screen.getByRole('textbox',{name:'Mensagem',exact:true});
    fireEvent.change(input,{target:{value:'Meu briefing'}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    fireEvent.click(await screen.findByRole('button',{name:'Reenviar envio pendente'}));
    await screen.findByText(nextStep);
    expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
    expect(input).toHaveValue('');
  });

  it('Dado intenção selecionada Quando cria outra conversa Então limpa a seleção e envia texto sem contexto anterior', async () => {
    const mock = setup();
    fireEvent.click(await screen.findByRole('button',{name:'Conversa atual',exact:true}));
    await waitFor(() => expect(screen.getByRole('textbox',{name:'Mensagem',exact:true})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Criar Reels para o Instagram',exact:true}));
    fireEvent.click(screen.getByRole('button',{name:'Nova conversa',exact:true}));
    await screen.findByRole('heading',{name:'Como posso ajudar?'});
    const input = screen.getByRole('textbox',{name:'Mensagem',exact:true});
    fireEvent.change(input,{target:{value:'Outra dúvida'}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByText(nextStep);
    const sends = posts(mock).filter(([url]) => url.endsWith('/messages'));
    expect(sends).toHaveLength(1); expect(sends[0][0]).toContain('/c3/messages');
    expect(JSON.parse(sends[0][1]!.body as string).content).toBe('Outra dúvida');
  });

});
