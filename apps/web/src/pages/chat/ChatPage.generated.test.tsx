import './chat-websocket-test-mock';
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';
vi.mock('./useChatPlans', () => ({useChatPlans: () => ({
  plans:[], loading:false, refreshing:false, error:null, errors:{}, busyPlanIds:[],
  refetch:vi.fn(), onAction:vi.fn(), onEdit:vi.fn(), onCompleteTask:vi.fn(),
})}));
vi.mock('./InstagramShare', () => ({InstagramShare: () => <button>Compartilhar no Instagram</button>}));
const base = {id:'approval', action:'Criar imagem', parameters:{}, result:{imageUrl:'https://example.com/a.png'}};
function history(approval:unknown) {
  vi.stubGlobal('fetch',vi.fn(async (url:string) => {
    if (url.endsWith('/conversations')) return new Response(JSON.stringify([{id:'conversation',title:'Histórico'}]));
    if (url.endsWith('/conversations/conversation')) return new Response(JSON.stringify({messages:[],approvals:[approval]}));
    throw new Error('unexpected request');
  }));
}
beforeEach(() => {sessionStorage.clear();localStorage.setItem('token','test');});
describe('mídia gerada no histórico', () => {
  it('mostra ações da imagem concluída', async () => {
    history({...base,status:'completed'});
    render(<ChatPage/>);
    fireEvent.click(await screen.findByRole('button',{name:'Histórico'}));
    expect(await screen.findByRole('button',{name:'Compartilhar no Instagram'})).toBeTruthy();
    expect(screen.getByRole('button',{name:'Baixar Imagem gerada'})).toBeTruthy();
  });
  it('não oferece mídia em ação pendente ou falha', async () => {
    history({...base,status:'failed'});
    render(<ChatPage/>);
    fireEvent.click(await screen.findByRole('button',{name:'Histórico'}));
    await screen.findByText(/não pôde ser confirmado/i);
    expect(screen.queryByRole('button',{name:'Compartilhar no Instagram'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Baixar Imagem gerada'})).toBeNull();
  });
});
