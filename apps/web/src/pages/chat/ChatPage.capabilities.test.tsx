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

it('integra as quatro sugestões no rascunho sem enviar', async () => {
  const fetchMock = vi.fn(async () => json([]));
  vi.stubGlobal('fetch', fetchMock);
  render(<ChatPage/>);
  for (const [label, prompt] of [
    ['Planejar postagens do mês', 'Quero planejar as postagens do mês'],
    ['Criar campanha', 'Quero criar uma campanha paga ou orgânica'],
    ['Criar vídeos', 'Quero criar um vídeo'],
    ['Criar imagens', 'Quero criar uma imagem'],
  ]) {
    fireEvent.click(screen.getByRole('button', {name:label}));
    expect(screen.getByLabelText('Mensagem')).toHaveValue(prompt);
    expect(screen.getByLabelText('Mensagem')).toHaveFocus();
  }
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
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
    : json({messages:[],approvals:[{id:'im',action:'Imagem',parameters:{},status:'completed',result:{imageUrl:'https://example.com/image.png', videoUrl:'https://example.com/video.mp4', job:{videoUrl:'https://example.com/job.mp4'}}}]})));
  render(<ChatPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Conversa B'}));
  const image = await screen.findByAltText('Imagem gerada');
  expect(image.style.maxWidth).toBe('');
  const videos = screen.getAllByLabelText('Vídeo gerado');
  expect(videos).toHaveLength(2);
  videos.forEach(video => expect(video.style.maxWidth).toBe(''));
});
