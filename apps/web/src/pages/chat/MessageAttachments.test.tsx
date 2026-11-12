// @vitest-environment jsdom
/* Funcionalidade: consultar anexos do histórico sem URLs públicas
 * Cenário: abrir por ação explícita — Dado metadados, Quando visualizo, Então busca bytes autenticados e mostra blob local.
 * Cenário: falha — Dado 401/403/404, Quando visualizo, Então mantém metadados e oferece nova tentativa.
 * Cenário: descarte — Dado preview carregada/pendente, Quando saio da conversa, Então revoga/aborta sem resultado tardio.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageAttachments } from './MessageAttachments';
const attachment = {id:'926c70e4-3d3c-4329-ad77-6a0738db408c',filename:'foto.png',mimeType:'image/png',sizeBytes:12};
beforeEach(() => { localStorage.setItem('token','private-token'); URL.createObjectURL = vi.fn(() => 'blob:private'); URL.revokeObjectURL = vi.fn(); });
afterEach(() => vi.useRealTimers());
describe('MessageAttachments', () => {
  it('libera nova tentativa após timeout sem resultado fabricado', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch',fetchMock);
    render(<MessageAttachments conversationId="conversation" attachments={[attachment]}/>);
    fireEvent.click(screen.getByRole('button',{name:'Visualizar foto.png'}));
    await act(async () => vi.advanceTimersByTime(60000));
    expect(screen.getByRole('alert')).toHaveTextContent(/demorou/);
    expect(screen.getByRole('button',{name:'Visualizar foto.png'})).toBeEnabled();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('busca bytes privados só ao abrir a imagem e revoga ao desmontar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('image',{headers:{'Content-Type':'image/png'}}));
    vi.stubGlobal('fetch',fetchMock);
    const {unmount} = render(<MessageAttachments conversationId="conversation" attachments={[attachment]}/>);
    expect(screen.getByText('foto.png')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Visualizar foto.png'}));
    expect(await screen.findByRole('img',{name:'foto.png'})).toHaveAttribute('src','blob:private');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/conversations\/conversation\/attachments\/926c70e4-3d3c-4329-ad77-6a0738db408c$/);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer private-token');
    expect(fetchMock.mock.calls[0][0]).not.toContain('token');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private');
  });
  it.each([401,403,404,500])('preserva nome e não fabrica preview após %s', async status => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status})));
    render(<MessageAttachments conversationId="conversation" attachments={[attachment]}/>);
    fireEvent.click(screen.getByRole('button',{name:'Visualizar foto.png'}));
    await screen.findByRole('alert');
    expect(screen.getByText('foto.png')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button',{name:'Visualizar foto.png'})).toBeEnabled();
  });
  it('aborta requisição ao desmontar e não cria blob para resposta tardia', async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise(r => {resolve = r;}));
    vi.stubGlobal('fetch',fetchMock);
    const {unmount} = render(<MessageAttachments conversationId="conversation" attachments={[attachment]}/>);
    fireEvent.click(screen.getByRole('button',{name:'Visualizar foto.png'}));
    unmount();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolve(new Response('image',{headers:{'Content-Type':'image/png'}})));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it.each([['application/pdf','Baixar arquivo.pdf'],['video/mp4','arquivo.pdf']])('apresenta %s com metadados persistidos', async (mimeType,label) => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('file',{headers:{'Content-Type':mimeType}})));
    render(<MessageAttachments conversationId="conversation" attachments={[{...attachment,filename:'arquivo.pdf',mimeType,pageCount:4,durationSeconds:75}]}/>);
    fireEvent.click(screen.getByRole('button',{name:'Visualizar arquivo.pdf'}));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    if (mimeType === 'application/pdf') {
      expect(screen.getByRole('link',{name:label})).toHaveAttribute('href','blob:private');
      expect(screen.getByText(/4 páginas/)).toBeInTheDocument();
    } else expect(screen.getByLabelText(label)).toHaveAttribute('controls');
  });
});
