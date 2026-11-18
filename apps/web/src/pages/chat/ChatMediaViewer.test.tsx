// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMediaViewer } from './ChatMediaViewer';

describe('visualização de mídia no chat', () => {
  it('abre imagem e fecha com Escape restaurando o foco', () => {
    render(<ChatMediaViewer src="blob:foto" kind="image" name="foto.png" onDownload={vi.fn()}/>);
    const open = screen.getByRole('button', {name: 'Abrir foto.png'});
    open.focus();
    fireEvent.click(open);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, {key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it('mostra controles de vídeo e baixa sem abrir visualizador', () => {
    const download = vi.fn();
    render(<ChatMediaViewer src="blob:video" kind="video" name="video.mp4" onDownload={download}/>);
    fireEvent.click(screen.getByRole('button', {name:'Baixar video.mp4'}));
    expect(download).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name:'Abrir video.mp4'}));
    expect(screen.getByRole('dialog').querySelector('video')?.hasAttribute('controls')).toBe(true);
    fireEvent.click(screen.getByRole('button', {name:'Fechar visualização'}));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
