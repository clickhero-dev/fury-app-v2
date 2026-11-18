import './chat-websocket-test-mock';
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';
vi.mock('../../lib/session-refresh',()=>({refreshSession:vi.fn()}));
vi.mock('./useChatPlans',()=>({useChatPlans:()=>({plans:[],errors:{},busyPlanIds:[],refetch:vi.fn()})}));
const recovery=(status:string)=>({status,nextAttemptAt:null,attempts:1,maxAttempts:3,deadlineAt:'2099-01-01T00:00:00Z',policyVersion:'1'});
const run=(id:string,status='queued')=>({id,user_message_id:'user-1',assistant_message_id:null as string | null,status:status==='running'?'running':'interrupted',recovery:recovery(status)});
beforeEach(()=>{sessionStorage.clear();localStorage.clear();localStorage.setItem('token','test');});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
function setup(initial='queued'){
  const state={runs:[run('old-run',initial)],messages:[{id:'user-1',role:'user',content:'Uma ideia para meu negócio'}],cancelResponse:{status:'cancelled'},cancelStatus:200};
  const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
    if(url.endsWith('/conversations'))return new Response(JSON.stringify([{id:'conv',title:'Ideia de café'},{id:'other',title:'Outra conversa'}]));
    if(url.endsWith('/conversations/conv'))return new Response(JSON.stringify({messages:state.messages,response_runs:state.runs,approvals:[]}));
    if(url.endsWith('/conversations/other'))return new Response(JSON.stringify({messages:[{id:'other-user',role:'user',content:'Outro tema'}],response_runs:[],approvals:[]}));
    if(url.endsWith('/cancel')){
      if(state.cancelStatus===200)state.runs=state.runs.map(item=>({...item,recovery:recovery(state.cancelResponse.status)}));
      return new Response(JSON.stringify(state.cancelResponse),{status:state.cancelStatus});
    }
    if(url.endsWith('/messages')&&init?.method==='POST')return new Response('event: done\ndata: {"message":{"id":"new-answer","content":"Nova direção"}}\n\n',{headers:{'content-type':'text/event-stream'}});
    throw new Error('Unexpected '+url);
  });
  vi.stubGlobal('fetch',fetcher);
  render(<ChatPage/>);
  return{state,fetcher};
}
describe('Recuperação durável na conversa',()=>{
  it('conclusão vence cancelamento e GET hidrata resultado sem afirmar cancelado',async()=>{
    const {state,fetcher}=setup('running');
    state.cancelResponse={status:'completed'};
    fireEvent.click(await screen.findByRole('button',{name:'Ideia de café'}));
    state.messages=[...state.messages,{id:'completed-answer',role:'assistant',content:'Resultado já concluído'}];
    fireEvent.click(await screen.findByRole('button',{name:'Cancelar próximas etapas'}));
    expect(await screen.findByText('Resultado já concluído')).toBeVisible();
    expect(screen.queryByText(/Próximas etapas canceladas/)).toBeNull();
    expect(screen.queryByRole('button',{name:'Ver outra ideia'})).toBeNull();
    expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/conversations/conv'))).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
  });
  it('novo pedido durante fila mantém polling mesmo com stream aberto sem reenvio automático',async()=>{
    const {state,fetcher}=setup();
    const original=fetcher.getMockImplementation()!;
    let controller!:ReadableStreamDefaultController<Uint8Array>;
    fetcher.mockImplementation(async(url,init)=>{
      if(url.endsWith('/messages')&&init?.method==='POST')return new Response(new ReadableStream<Uint8Array>({start(output){controller=output;}}),{headers:{'content-type':'text/event-stream'}});
      return original(url,init);
    });
    const open=await screen.findByRole('button',{name:'Ideia de café'});
    vi.useFakeTimers();
    await act(async()=>{fireEvent.click(open);});
    expect(screen.getByRole('textbox',{name:'Mensagem'})).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox',{name:'Mensagem'}),{target:{value:'Outra direção solicitada'}});
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));});
    expect(screen.getByText('Ady está respondendo…')).toBeVisible();
    state.runs=[run('replacement-run','running')];
    await act(async()=>{await vi.advanceTimersByTimeAsync(3100);});
    expect(screen.getByText('Ady está trabalhando.')).toBeVisible();
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
    state.runs=[{...run('replacement-run','completed'),assistant_message_id:'recovered-final'}];
    state.messages=[...state.messages,{id:'recovered-final',role:'assistant',content:'Resultado concluído pelo recovery'}];
    await act(async()=>{await vi.advanceTimersByTimeAsync(3100);});
    expect(screen.getByText('Resultado concluído pelo recovery')).toBeVisible();
    expect(screen.getByText('Outra direção solicitada')).toBeVisible();
    await act(async()=>{controller.close();});
  });
  it('polling queued sem stream hidrata novo run e conclusão, sem repetir mensagens',async()=>{
    const {state,fetcher}=setup();
    const open=await screen.findByRole('button',{name:'Ideia de café'});
    vi.useFakeTimers();
    await act(async()=>{fireEvent.click(open);});
    expect(screen.getByText(/Recuperando o andamento/)).toBeVisible();
    expect(screen.queryByRole('button',{name:/Retomar resposta/})).toBeNull();
    state.runs=[run('new-run','running'),run('old-run')];
    await act(async()=>{await vi.advanceTimersByTimeAsync(3100);});
    expect(screen.getByText('Ady está trabalhando.')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Cancelar próximas etapas'}));
    await act(async()=>{await Promise.resolve();});
    expect(fetcher.mock.calls.find(([url])=>url.endsWith('/cancel'))?.[0]).toContain('/new-run/cancel');
    expect(screen.getByText(/Próximas etapas canceladas/)).toBeVisible();
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
  });
  it('hidrata resultado final e encerra polling sem alegar sucesso antes do servidor',async()=>{
    const {state,fetcher}=setup();
    const open=await screen.findByRole('button',{name:'Ideia de café'});
    vi.useFakeTimers();
    await act(async()=>{fireEvent.click(open);});
    expect(screen.getByText(/Recuperando o andamento/)).toBeVisible();
    state.runs=[run('new-run','completed')];
    state.messages=[...state.messages,{id:'answer',role:'assistant',content:'Resultado recuperado'}];
    await act(async()=>{await vi.advanceTimersByTimeAsync(3100);});
    expect(screen.getByText('Resultado recuperado')).toBeVisible();
    const reads=fetcher.mock.calls.length;
    await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
    expect(fetcher).toHaveBeenCalledTimes(reads);
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
  });
  it('cancelamento confirmado oferece nova direção mantendo histórico; erro não afirma cancelamento',async()=>{
    const {state,fetcher}=setup('running');
    fireEvent.click(await screen.findByRole('button',{name:'Ideia de café'}));
    fireEvent.click(await screen.findByRole('button',{name:'Cancelar próximas etapas'}));
    fireEvent.click(await screen.findByRole('button',{name:'Ver outra ideia'}));
    const suggestions=screen.getByRole('group',{name:'Outra direção'});
    fireEvent.click(within(suggestions).getByRole('button',{name:'Não sei o que postar'}));
    expect(await screen.findByText('Nova direção')).toBeVisible();
    expect(screen.getByText('Uma ideia para meu negócio')).toBeVisible();
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(2);
    expect(state.runs).toHaveLength(1);
  });
  it.each(['stopped','exhausted'])('mostra pausa %s sem retry automático',async status=>{
    const {fetcher}=setup(status);
    fireEvent.click(await screen.findByRole('button',{name:'Ideia de café'}));
    expect(await screen.findByText(/execução foi pausada/)).toBeVisible();
    expect(screen.queryByRole('button',{name:/Retomar resposta/})).toBeNull();
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
  });
  it('falha ao cancelar e mudança de conversa não aplicam estado na conversa errada',async()=>{
    const {state}=setup();
    state.cancelStatus=503;
    fireEvent.click(await screen.findByRole('button',{name:'Ideia de café'}));
    fireEvent.click(await screen.findByRole('button',{name:'Cancelar próximas etapas'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível confirmar/);
    expect(screen.queryByRole('button',{name:'Ver outra ideia'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Outra conversa'}));
    await screen.findByText('Outro tema');
    await waitFor(()=>expect(screen.queryByText(/Recuperando o andamento/)).toBeNull());
  });
});
