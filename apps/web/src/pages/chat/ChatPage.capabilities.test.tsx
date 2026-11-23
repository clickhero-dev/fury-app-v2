// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';

vi.mock('../../lib/session-refresh', () => ({refreshSession: vi.fn()}));
vi.mock('./ChatPlanCard', () => ({ChatPlanCard: () => <div>Plano ativo</div>}));
vi.mock('./useChatPlans', () => ({useChatPlans: (id: string | null) => ({
  plans: id === 'a' ? [{id:'plan-a',status:'running'}] : [], errors:{}, error:null, busyPlanIds:[],
  refetch:vi.fn(), onAction:vi.fn(), onEdit:vi.fn(), onCompleteTask:vi.fn(),
})}));
const json = (data: unknown) => new Response(JSON.stringify(data));
beforeEach(() => { sessionStorage.clear(); localStorage.setItem('token','token'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('prepara o post no clique e apresenta próximos passos pelo contrato clarify existente', async () => {
  const sends: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversations')) return json(init?.method === 'POST' ? {id:'b',title:'Nova conversa'} : []);
    if (url.endsWith('/messages')) {
      sends.push(JSON.parse(init!.body as string));
      return new Response(`event: done\ndata: ${JSON.stringify({message:{id:'m',role:'assistant',content:'Aqui está seu próximo post.'},clarification:{id:'next',run_id:'r',message_id:'m',question:'Quer continuar?',choices:['Ajustar o texto','Preparar outra ideia'],selected_index:null}})}\n\n`);
    }
    if (url.endsWith('/answer')) return new Response('event: done\ndata: {"message":{"id":"m2","role":"assistant","content":"Aqui vai outra ideia."}}\n\n');
    throw new Error(url);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<ChatPage/>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Vamos preparar seu próximo post?')).toBeInTheDocument();
  expect(screen.getByText(/Você não precisa saber de marketing/)).toBeInTheDocument();
  expect(sends).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', {name:'Não sei o que postar',exact:true}));
  await screen.findByText('Aqui está seu próximo post.');
  expect(screen.getByLabelText('Mensagem')).toHaveValue('');
  expect(screen.queryByLabelText('Qual é o tema do post e para qual público?')).not.toBeInTheDocument();
  expect(sends).toHaveLength(1);
  expect(sends[0].content).toEqual(expect.stringContaining('próximo post'));
  fireEvent.click(screen.getByRole('button', {name:'Preparar outra ideia'}));
  await screen.findByText('Aqui vai outra ideia.');
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/answer'))).toHaveLength(1);
});

it('consulta aprovações de worker de plano ativo e isola resposta atrasada ao trocar de conversa', async () => {
  let resolvePoll!: (value: Response) => void;
  let aLoads = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return json([{id:'a',title:'Conversa A'},{id:'b',title:'Conversa B'}]);
    if (url.endsWith('/conversations/a')) {
      if (++aLoads === 1) return json({messages:[], approvals:[]});
      return new Promise<Response>(resolve => { resolvePoll = resolve; });
    }
    if (url.endsWith('/conversations/b')) return json({messages:[{id:'b1',role:'user',content:'Somente B'}],approvals:[]});
    throw new Error(`Unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  await screen.findByText('Plano ativo');
  await waitFor(() => expect(resolvePoll).toBeDefined(), {timeout:5000});
  fireEvent.click(screen.getByRole('button',{name:'Conversa B'}));
  await screen.findByText('Somente B');
  await act(async () => resolvePoll(json({messages:[],approvals:[{id:'ap',action:'Aprovação A',parameters:{},status:'pending'}]})));
  expect(screen.queryByText(/Aprovação A/)).not.toBeInTheDocument();
}, 10000);

it('exibe aprovação nova de worker sem recarregar a página', async () => {
  let aLoads = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/conversations')) return json([{id:'a',title:'Conversa A'}]);
    if (url.endsWith('/conversations/a')) return json({messages:[],approvals:++aLoads === 1 ? [] : [{id:'ap',action:'Aprovação do plano',parameters:{},status:'pending'}]});
    throw new Error(`Unexpected ${url}`);
  }));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa A'}));
  expect(await screen.findByText(/Aprovação do plano/, {}, {timeout:5000})).toBeInTheDocument();
}, 10000);

it('não sobrepõe os limites responsivos de imagem com estilo inline', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/conversations')
    ? json([{id:'b',title:'Conversa B'}])
    : json({messages:[],approvals:[{id:'im',action:'Imagem',parameters:{},status:'completed',result:{imageUrl:'https://example.com/image.png', videoUrl:'https://example.com/video.mp4', job:{status:'done',videoUrl:'https://example.com/job.mp4'}}}]})));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa B'}));
  const image = await screen.findByAltText('Imagem gerada');
  expect(image.style.maxWidth).toBe('');
  const videos = screen.getAllByLabelText('Vídeo gerado');
  expect(videos).toHaveLength(2);
  videos.forEach(video => expect(video.style.maxWidth).toBe(''));
});
