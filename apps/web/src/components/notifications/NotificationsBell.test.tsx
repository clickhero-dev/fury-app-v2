/*
Funcionalidade: centro de notificações
Cenário: consultar e marcar notificações
Dado que existem notificações lidas e não lidas do usuário
Quando o usuário abre o sino e marca uma como lida
Então o contador e o estado visual são atualizados sem recarregar a página
*/
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsBell } from './NotificationsBell';

const { get, patch } = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: { data: { items: [{ id: 'n1', type: 'general', title: 'Aviso', body: 'Texto', createdAt: new Date().toISOString(), readAt: null }], nextCursor: null, unreadCount: 1 } } }),
  patch: vi.fn().mockResolvedValue({ data: { data: { id: 'n1', readAt: new Date().toISOString() } } }),
}));
vi.mock('@/lib/api', () => ({ default: { get, patch, post: vi.fn() } }));

function renderBell() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NotificationsBell /></QueryClientProvider>); }

describe('NotificationsBell', () => {
  it('shows unread count, opens the list and marks an item read', async () => {
    renderBell();
    expect(await screen.findByLabelText(/notificações, 1 não lida/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /notificações/i }));
    expect(await screen.findByText('Aviso')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /marcar aviso como lida/i }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/notifications/n1/read'));
  });
});
