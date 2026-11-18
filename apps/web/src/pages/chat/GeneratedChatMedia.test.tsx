// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeneratedChatMedia } from './GeneratedChatMedia';
vi.mock('./InstagramShare', () => ({InstagramShare: () => null}));

describe('mídia gerada', () => {
  it('permite abrir imagem e relata erro ao baixar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<GeneratedChatMedia src="https://example.com/image.png" kind="image" mediaKey="a"/>);
    fireEvent.click(screen.getByRole('button', {name:'Baixar Imagem gerada'}));
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name:'Abrir Imagem gerada'}));
    expect(screen.getByRole('dialog')).toBeTruthy();
    vi.unstubAllGlobals();
  });
  it('baixa vídeo sem abrir tela cheia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true, blob:async () => new Blob(['video'], {type:'video/mp4'})}));
    URL.createObjectURL = vi.fn(() => 'blob:generated');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(() => {});
    render(<GeneratedChatMedia src="https://example.com/video.mp4" kind="video" mediaKey="b"/>);
    fireEvent.click(screen.getByRole('button', {name:'Baixar Vídeo gerado'}));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).toBeNull();
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
