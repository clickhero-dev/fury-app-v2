import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FaqsPage } from './FaqsPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, patch: mockPatch, delete: mockDelete } }));

const faq = { id: 'faq-1', title: 'Como conectar a conta?', slug: 'conectar-conta', markdown: 'Passo **um**.', status: 'draft' as const };

describe('FaqsPage actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: [faq] } });
    mockPatch.mockResolvedValue({ data: { data: faq } });
    mockDelete.mockResolvedValue({ data: { success: true } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows the FAQ content in a preview, including drafts', async () => {
    render(<FaqsPage />);
    await screen.findByText(faq.title);
    fireEvent.click(screen.getByRole('button', { name: `Ver FAQ: ${faq.title}` }));
    expect(await screen.findByRole('dialog', { name: `Visualizar FAQ: ${faq.title}` })).toBeInTheDocument();
    expect(screen.getByText('um')).toBeInTheDocument();
  });

  it('opens the FAQ in the editor', async () => {
    render(<FaqsPage />);
    await screen.findByText(faq.title);
    fireEvent.click(screen.getByRole('button', { name: `Editar FAQ: ${faq.title}` }));
    expect(screen.getByLabelText('Título')).toHaveValue(faq.title);
    expect(screen.getByLabelText('Conteúdo Markdown')).toHaveValue(faq.markdown);
  });

  it('deletes the FAQ after confirmation and refreshes the list', async () => {
    render(<FaqsPage />);
    await screen.findByText(faq.title);
    fireEvent.click(screen.getByRole('button', { name: `Excluir FAQ: ${faq.title}` }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(`/admin/faqs/${faq.id}`));
    expect(window.confirm).toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
