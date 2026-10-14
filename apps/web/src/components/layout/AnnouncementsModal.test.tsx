import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementsModal } from './AnnouncementsModal';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: mockPost } }));

const items = [
  { id: 'a1', title: 'Primeira novidade', markdown: 'Texto **um**' },
  { id: 'a2', title: 'Segunda novidade', markdown: 'Texto dois' },
];
const renderModal = (enabled = true) => render(<QueryClientProvider client={new QueryClient()}><AnnouncementsModal enabled={enabled} /></QueryClientProvider>);

describe('AnnouncementsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: items } });
    mockPost.mockResolvedValue({ data: { success: true } });
  });

  it('walks through each announcement, marking it seen on confirm', async () => {
    renderModal();
    expect(await screen.findByRole('dialog', { name: 'Primeira novidade' })).toBeInTheDocument();
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('dialog', { name: 'Segunda novidade' })).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/announcements/a1/seen');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockPost).toHaveBeenCalledWith('/announcements/a2/seen');
  });

  it('cannot be closed with Escape and has no close button', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('advances even if saving the view fails', async () => {
    mockPost.mockRejectedValueOnce(new Error('offline'));
    renderModal();
    await screen.findByRole('dialog', { name: 'Primeira novidade' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('dialog', { name: 'Segunda novidade' })).toBeInTheDocument();
  });

  it('does not fetch while disabled', () => {
    renderModal(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
