import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementsPage } from './AnnouncementsPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: mockPost, patch: mockPatch } }));

const aiButton = () => screen.getByRole('button', { name: /Gerar texto base com IA/ });

describe('AnnouncementsPage AI base text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockPost.mockResolvedValue({ data: { data: { markdown: '## Novidade' } } });
  });

  it('generates base text only while the editor is empty', async () => {
    render(<AnnouncementsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Novo aviso/ }));
    fireEvent.click(aiButton());
    fireEvent.change(screen.getByLabelText('Texto simples'), { target: { value: 'novidade nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Transformar' }));
    expect(await screen.findByDisplayValue('## Novidade')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/admin/announcements/format', { text: 'novidade nova' });
    expect(aiButton()).toBeDisabled();
    expect(screen.queryByLabelText('Texto simples')).not.toBeInTheDocument();
  });

  it('starts active with no extra mode; Manter ativo and end date are exclusive', async () => {
    render(<AnnouncementsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Novo aviso/ }));
    const keep = screen.getByRole('switch', { name: 'Manter ativo' });
    const date = screen.getByLabelText('Definir encerramento');
    expect(screen.getByRole('switch', { name: 'Ativo' })).toHaveAttribute('aria-checked', 'true');
    expect(keep).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(keep);
    expect(date).toBeDisabled();
    fireEvent.click(keep);
    fireEvent.change(date, { target: { value: '2026-12-01T10:00' } });
    expect(keep).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar data' }));
    expect(keep).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Limpar data' })).not.toBeInTheDocument();
  });

  it('saves "only Ativo" as existing-users-only', async () => {
    render(<AnnouncementsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Novo aviso/ }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Aviso' } });
    fireEvent.change(screen.getByLabelText('Conteúdo Markdown'), { target: { value: 'texto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/announcements', expect.objectContaining({ isActive: true, showToNewUsers: false, endsAt: null })));
  });

  it('inserts the image at the cursor position', async () => {
    mockPost.mockResolvedValue({ data: { data: { url: 'https://cdn/x.png' } } });
    render(<AnnouncementsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Novo aviso/ }));
    const editor = screen.getByLabelText('Conteúdo Markdown') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'ANTES DEPOIS' } });
    editor.setSelectionRange(5, 5);
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(editor.value).toBe('ANTES\n![imagem](https://cdn/x.png)\n DEPOIS'));
  });

  it('toggles active straight from the list', async () => {
    mockGet.mockResolvedValue({ data: { data: [{ id: 'a1', title: 'Evento', markdown: 'x', isActive: true, showToNewUsers: false, endsAt: null }] } });
    mockPatch.mockResolvedValue({ data: { data: {} } });
    render(<AnnouncementsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar aviso: Evento' }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/admin/announcements/a1', { isActive: false }));
    expect(screen.getByRole('button', { name: 'Editar aviso: Evento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir aviso: Evento' })).toBeInTheDocument();
  });

  it('re-enables once the user clears the content', async () => {
    render(<AnnouncementsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Novo aviso/ }));
    const editor = screen.getByLabelText('Conteúdo Markdown');
    fireEvent.change(editor, { target: { value: 'texto manual' } });
    expect(aiButton()).toBeDisabled();
    fireEvent.change(editor, { target: { value: '' } });
    expect(aiButton()).toBeEnabled();
  });
});
