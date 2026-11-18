import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';
vi.mock('./useQuickActionContext',()=>({useQuickActionContext:()=>({tenantName:'Flores da Ana',city:'Recife',businessContext:'Floricultura local'})}));
const answer='Ideia pronta para revisar.';
function setup({existing=true,fail=false}={}) {
  const mock=vi.fn(async(url:string,init?:RequestInit)=>{
    if(url.endsWith('/conversations') && init?.method==='POST')return fail?new Response('{}',{status:503}):Response.json({id:existing?'c3':'c1',title:'Nova'});
    if(url.endsWith('/messages'))return new Response(`event: done\ndata: ${JSON.stringify({message:{content:answer}})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});
    if(url.endsWith('/conversations/c1'))return Response.json({id:'c1',messages:[],approvals:[]});
    if(url.endsWith('/plans'))return Response.json({plans:[]});
    return Response.json(existing?[{id:'c1',title:'Conversa atual'}]:[]);
  });
  vi.stubGlobal('fetch',mock);render(<ChatPage/>);return mock;
}
const posts=(mock:ReturnType<typeof setup>)=>mock.mock.calls.filter(([,init])=>init?.method==='POST');
async function explore(){
  fireEvent.click(screen.getByRole('button',{name:'Outras ideias para meu negócio',exact:true}));
  return screen.findByRole('button',{name:'Apresentar Flores da Ana em Recife'});
}
beforeEach(()=>{sessionStorage.clear();localStorage.clear();localStorage.setItem('token','test');});
describe('Sugestões contextuais sem briefing obrigatório',()=>{
  it('escolha contextual duplicada envia uma vez na mesma conversa com contexto e gates preservados',async()=>{
    const mock=setup();
    fireEvent.click(await screen.findByRole('button',{name:'Conversa atual',exact:true}));
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'Mensagem',exact:true})).toBeEnabled());
    const option=await explore();
    expect(within(document.querySelector('.ady-chat-main') as HTMLElement).getAllByRole('textbox')).toHaveLength(1);
    expect(posts(mock)).toHaveLength(0);
    fireEvent.click(option);fireEvent.click(option);
    await screen.findByText(answer);
    expect(posts(mock)).toHaveLength(1);expect(posts(mock)[0][0]).toContain('/conversations/c1/messages');
    const body=JSON.parse(posts(mock)[0][1]!.body as string);
    expect(body.content).toContain('Flores da Ana');
    expect(body.content).toContain('Recife');
    expect(body.content).toContain('Floricultura local');
    expect(body.content).toContain('confirmação explícita');
    expect(body.content).not.toContain('Qual é o tema');
  });
  it('cada um dos três atalhos inicia direto sem resposta obrigatória',async()=>{
    const mock=setup({existing:false});
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'Mensagem',exact:true})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Não sei o que postar',exact:true}));
    await screen.findByText(answer);
    expect(posts(mock)).toHaveLength(2);
    expect(JSON.parse(posts(mock)[1][1]!.body as string).content).toContain('próximo post');
    expect(screen.getByRole('textbox',{name:'Mensagem'})).toHaveValue('');
  });
  it('abrir sugestões não altera texto livre nem injeta contexto/ação no compositor',async()=>{
    const mock=setup({existing:false});
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'Mensagem',exact:true})).toBeEnabled());
    await explore();
    const input=screen.getByRole('textbox',{name:'Mensagem',exact:true});
    fireEvent.change(input,{target:{value:'Quero falar de outro assunto'}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByText(answer);
    const sends=posts(mock).filter(([url])=>url.endsWith('/messages'));
    expect(JSON.parse(sends[0][1]!.body as string).content).toBe('Quero falar de outro assunto');
    expect(input).toHaveValue('');
  });
  it('falha ao criar conserva rascunho e sugestões para nova escolha explícita',async()=>{
    const mock=setup({existing:false,fail:true});
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'Mensagem',exact:true})).toBeEnabled());
    const input=screen.getByRole('textbox',{name:'Mensagem',exact:true});
    fireEvent.change(input,{target:{value:'Meu rascunho'}});
    fireEvent.click(await explore());
    await screen.findByText('Não foi possível iniciar a conversa.');
    expect(input).toHaveValue('Meu rascunho');
    expect(screen.getByRole('button',{name:'Apresentar Flores da Ana em Recife'})).toBeEnabled();
    expect(posts(mock)).toHaveLength(1);
  });
  it('envio incerto só permite reenvio explícito do mesmo payload, sem apagar outro rascunho',async()=>{
    let attempts=0;const bodies:string[]=[];
    const mock=setup();
    mock.mockImplementation(async(url,init)=>{
      if(url.endsWith('/messages')){
        bodies.push(String(init?.body));
        if(++attempts===1)throw new Error('offline');
        return new Response(`event: done\ndata: ${JSON.stringify({message:{content:answer}})}\n\n`);
      }
      if(url.endsWith('/conversations/c1'))return Response.json({messages:[],approvals:[],response_runs:[]});
      if(url.endsWith('/plans'))return Response.json({plans:[]});
      return Response.json([{id:'c1',title:'Conversa atual'}]);
    });
    fireEvent.click(await screen.findByRole('button',{name:'Conversa atual',exact:true}));
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'Mensagem'})).toBeEnabled());
    fireEvent.change(screen.getByRole('textbox',{name:'Mensagem'}),{target:{value:'Rascunho não enviado'}});
    fireEvent.click(await explore());
    fireEvent.click(await screen.findByRole('button',{name:'Reenviar envio pendente'}));
    await screen.findByText(answer);
    expect(bodies).toHaveLength(2);expect(bodies[1]).toBe(bodies[0]);
    expect(screen.getByRole('textbox',{name:'Mensagem'})).toHaveValue('Rascunho não enviado');
  });
  it('nova conversa fecha opções antigas e texto novo não herda escolha anterior',async()=>{
    const mock=setup();
    fireEvent.click(await screen.findByRole('button',{name:'Conversa atual',exact:true}));
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'Mensagem'})).toBeEnabled());
    await explore();
    fireEvent.click(screen.getByRole('button',{name:'Nova conversa',exact:true}));
    await waitFor(()=>expect(screen.queryByRole('group',{name:'Sugestões para meu negócio'})).toBeNull());
    const input=screen.getByRole('textbox',{name:'Mensagem'});
    fireEvent.change(input,{target:{value:'Outra dúvida'}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByText(answer);
    const sends=posts(mock).filter(([url])=>url.endsWith('/messages'));
    expect(sends[0][0]).toContain('/c3/messages');
    expect(JSON.parse(sends[0][1]!.body as string).content).toBe('Outra dúvida');
  });
});
