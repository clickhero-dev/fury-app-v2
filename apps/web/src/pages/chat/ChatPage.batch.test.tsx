// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';
vi.mock('../../lib/session-refresh', () => ({ refreshSession: vi.fn() }));
vi.mock('./useChatPlans', () => ({ useChatPlans: () => ({ plans: [], errors: {}, busyPlanIds: [], refetch: vi.fn() }) }));
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); localStorage.setItem('token', 'test'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const approvals = [
  { id:'a', action:'Criar imagem',status:'pending',parameters:{prompt:'Café'} },
  { id:'b', action:'Agendar publicação',status:'pending',parameters:{caption:'Olá'} },
];
const snapshot = {reviewToken:'12345678-1234-4234-8234-123456789012',version:1,digest:'b'.repeat(64),approvalIds:['a','b'],expiresAt:'2099-01-01T00:00:00Z',items:approvals.map((item,index)=>({id:item.id,method:'POST',path:index?'/api/planner/posts':'/api/studio/ai/generate-image',parameters:item.parameters,expiresAt:'2099-01-01T00:00:00Z',cost:{known:false,value:null},quota:{known:false,value:null}}))};
function setup(confirm: () => Promise<Response> = async () => new Response(JSON.stringify({items:[{id:'a',status:'completed',result:{}},{id:'b',status:'unknown',result:{error:'private secret'}}],partialFailure:true})), history: () => unknown = () => approvals) {
  const fetcher = vi.fn(async (url:string,init?:RequestInit) => {
    if(url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'conv',title:'Campanha de café'}]));
    if(url.endsWith('/conversations/conv')) return new Response(JSON.stringify({messages:[],approvals:history()}));
    if(url.endsWith('/approvals/review')) return new Response(JSON.stringify(snapshot));
    if(url.endsWith('/approvals/confirm-batch') && init?.method==='POST') return confirm();
    throw new Error('Unexpected '+url);
  });
  vi.stubGlobal('fetch',fetcher);
  render(<ChatPage/>);
  return fetcher;
}
async function review() {
  fireEvent.click(await screen.findByRole('button',{name:'Campanha de café'}));
  const batch = await screen.findByRole('region',{name:'Revisar ações em lote'});
  fireEvent.click(within(batch).getByRole('checkbox',{name:'Criar imagem'}));
  fireEvent.click(within(batch).getByRole('checkbox',{name:'Agendar publicação'}));
  fireEvent.click(within(batch).getByRole('button',{name:'Revisar selecionados'}));
  return screen.findByRole('button',{name:'Confirmar 2 ações revisadas'});
}
describe('Chat revisão em lote',()=>{
  it('resposta ambígua tardia não apaga conclusão persistida já recuperada',async()=>{
    let resolve!: (response:Response)=>void;
    let history=approvals;
    setup(()=>new Promise<Response>(done=>{resolve=done;}),()=>history);
    fireEvent.click(await review());
    history=approvals.map(item=>({...item,status:'completed'}));
    fireEvent.click(screen.getByRole('button',{name:'Campanha de café'}));
    await waitFor(()=>expect(document.querySelector('[data-approval-id="a"]')).toHaveAttribute('data-status','completed'));
    resolve(new Response(JSON.stringify({items:[{id:'a',status:'unknown',result:null},{id:'b',status:'unknown',result:null}],partialFailure:false})));
    await screen.findByRole('list',{name:'Resultados do lote'});
    expect(document.querySelector('[data-approval-id="a"]')).toHaveAttribute('data-status','completed');
  });
  it('confirma snapshot e mantém resultados parciais sem confirmar cada ação novamente',async()=>{
    const fetcher=setup();
    fireEvent.click(await review());
    await waitFor(()=>expect(document.querySelector('[data-approval-id="a"]')).toHaveAttribute('data-status','completed'));
    expect(document.querySelector('[data-approval-id="b"]')).toHaveAttribute('data-status','unknown');
    expect(screen.queryByText('private secret')).toBeNull();
    expect(screen.queryByRole('button',{name:'Confirmar ação'})).toBeNull();
    const posts=fetcher.mock.calls.filter(([,init])=>init?.method==='POST');
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[1][1]!.body as string)).toEqual({approvalIds:['a','b'],reviewToken:snapshot.reviewToken,version:1,digest:snapshot.digest});
  });
  it('não permite single durante envio em lote e bloqueia incerteza ao atualizar',async()=>{
    let reject!: (error:Error)=>void;
    const fetcher=setup(()=>new Promise<Response>((_,fail)=>{reject=fail;}));
    fireEvent.click(await review());
    expect(screen.getAllByRole('button',{name:'Confirmar ação'}).every(button=>(button as HTMLButtonElement).disabled)).toBe(true);
    reject(new Error('network'));
    await waitFor(()=>expect(document.querySelector('[data-approval-id="a"]')).toHaveAttribute('data-status','unknown'));
    fireEvent.click(screen.getByRole('button',{name:'Campanha de café'}));
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Confirmar ação'})).toBeNull());
    expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/confirm-batch'))).toHaveLength(1);
  });
});
