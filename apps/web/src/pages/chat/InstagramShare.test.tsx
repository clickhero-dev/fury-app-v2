// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstagramShare } from './InstagramShare';
import api from '@/lib/api';

vi.mock('@/lib/api', () => ({default: {get: vi.fn(), post: vi.fn()}}));
const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
describe('compartilhamento no Instagram', () => {
  it('oferece conexão quando não há conta e não publica', async () => {
    get.mockResolvedValueOnce({data:{data:[]}});
    render(<InstagramShare src="https://example.com/imagem.png" kind="image" mediaKey="a"/>);
    expect(await screen.findByRole('link', {name:/conectar instagram/i})).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
  it('pede revisão e confirmação antes de publicar', async () => {
    get.mockResolvedValueOnce({data:{data:[{selectedInstagramUserId:'ig',selectedInstagramUsername:'loja'}]}});
    get.mockResolvedValueOnce({data:{data:{scopes:['instagram_content_publish']}}});
    post.mockResolvedValueOnce({data:{data:{status:'published',instagramUsername:'loja'}}});
    render(<InstagramShare src="https://example.com/imagem.png" kind="image" mediaKey="b"/>);
    fireEvent.click(await screen.findByRole('button', {name:'Compartilhar no Instagram'}));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(/@loja/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Legenda'), {target:{value:'Olá'}});
    fireEvent.click(screen.getByRole('button', {name:'Confirmar publicação'}));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(post.mock.calls[0][0]).toBe('/planner/chat-media/b/publish');
    expect(post.mock.calls[0][1]).toEqual({caption:'Olá',instagramUserId:'ig'});
    expect(await screen.findByText(/publicado com sucesso/i)).toBeTruthy();
  });
  it('não considera erro de permissão como conta desconectada', async () => {
    get.mockResolvedValueOnce({data:{data:[{selectedInstagramUserId:'ig'}]}});
    get.mockRejectedValueOnce(new Error('offline'));
    render(<InstagramShare src="https://example.com/imagem.png" kind="image" mediaKey="c"/>);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('link', {name:/conectar instagram/i})).toBeNull();
  });
  it('orienta recuperar permissão sem classificar conta conectada como desconectada', async () => {
    get.mockResolvedValueOnce({data:{data:[{selectedInstagramUserId:'ig'}]}});
    get.mockResolvedValueOnce({data:{data:{scopes:[]}}});
    render(<InstagramShare src="https://example.com/imagem.png" kind="image" mediaKey="d"/>);
    expect(await screen.findByText(/permissão de publicação ausente/i)).toBeTruthy();
    expect(screen.queryByRole('link', {name:/conectar instagram/i})).toBeNull();
    expect((screen.getByRole('button', {name:'Compartilhar no Instagram'}) as HTMLButtonElement).disabled).toBe(true);
  });
  it('não repete publicação após resultado incerto mesmo após remontar', async () => {
    get.mockResolvedValue({data:{data:[{selectedInstagramUserId:'ig'}]}});
    get.mockResolvedValueOnce({data:{data:[{selectedInstagramUserId:'ig'}]}});
    get.mockResolvedValueOnce({data:{data:{scopes:['instagram_content_publish']}}});
    post.mockRejectedValueOnce(new Error('timeout'));
    const view = render(<InstagramShare src="https://example.com/video.mp4" kind="video" mediaKey="e"/>);
    fireEvent.click(await screen.findByRole('button', {name:'Compartilhar no Instagram'}));
    fireEvent.click(screen.getByRole('button', {name:'Confirmar publicação'}));
    expect(await screen.findByText(/não foi possível confirmar/i)).toBeTruthy();
    expect(post).toHaveBeenCalledOnce();
    view.unmount();
    get.mockResolvedValueOnce({data:{data:[{selectedInstagramUserId:'ig'}]}});
    get.mockResolvedValueOnce({data:{data:{scopes:['instagram_content_publish']}}});
    render(<InstagramShare src="https://example.com/video.mp4" kind="video" mediaKey="e"/>);
    expect(await screen.findByText(/publicação anterior/i)).toBeTruthy();
    expect((screen.getByRole('button', {name:'Compartilhar no Instagram'}) as HTMLButtonElement).disabled).toBe(true);
    expect(post).toHaveBeenCalledOnce();
  });
});
