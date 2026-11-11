/*
 * Funcionalidade: justificar a recomendação de um post do Instagram
 *
 * Cenário: motivo visível no card recomendado
 *   Dado um post recomendado com motivo retornado pela API
 *   Quando a aba é renderizada
 *   Então selo e frase ficam visíveis e o card continua selecionável por teclado
 *
 * Cenário: payload tolerante
 *   Dado payload legado, motivo vazio ou motivo em post não recomendado
 *   Quando a aba é renderizada
 *   Então não aparece uma justificativa órfã
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstagramPostsTab } from './InstagramPostsTab';

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockApiGet } }));

const reason = 'Mais chance de trazer novos clientes.';
function post(overrides: Record<string, unknown> = {}) {
  return { id: 'post-1', caption: 'Post recomendado', timestamp: '2026-10-01T12:00:00.000Z', like_count: 42, comments_count: 7, insights: { reach: 1000, saved: 12, shares: 4, replies: 2 }, score: 0.95, recommended: true, ...overrides };
}
function renderTab(onToggle = vi.fn()) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><InstagramPostsTab selected={[]} onToggle={onToggle} objective="engagement" /></QueryClientProvider>);
}

beforeEach(() => mockApiGet.mockReset());

describe('InstagramPostsTab — justificativa do post recomendado', () => {
  it('no fluxo de seguidores mostra uma única recomendação com aceitar ou escolher outro', async () => {
    mockApiGet.mockResolvedValue({ data: { success: true, data: [post({ recommendationReason: 'Mais chance de trazer novos seguidores.' })] } });
    const onToggle = vi.fn();
    const onReject = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><InstagramPostsTab selected={[]} onToggle={onToggle} objective="followers" onRejectRecommendation={onReject} /></QueryClientProvider>);

    expect(await screen.findByText('Recomendação do ady')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar esta recomendação' }));
    expect(onToggle).toHaveBeenCalledWith({ id: 'post-1', mediaUrl: undefined, caption: 'Post recomendado' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Escolher outro' }));
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('exibe motivo no recomendado e preserva seleção por teclado', async () => {
    const onToggle = vi.fn();
    mockApiGet.mockResolvedValue({ data: { success: true, data: [post({ recommendationReason: reason })] } });
    const user = userEvent.setup();
    renderTab(onToggle);

    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.getByText('⚡ Recomendado pelo ady')).toBeInTheDocument();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledWith({ id: 'post-1', mediaUrl: undefined, caption: 'Post recomendado' });
  });

  it.each([
    ['payload legado', [post()]],
    ['motivo vazio', [post({ recommendationReason: '   ' })]],
    ['motivo no não recomendado', [post({ recommended: false, recommendationReason: reason })]],
  ])('não exibe linha órfã para %s', async (_caseName, data) => {
    mockApiGet.mockResolvedValue({ data: { success: true, data } });
    renderTab();

    await screen.findByText('Post recomendado');
    expect(screen.queryByText(reason)).not.toBeInTheDocument();
  });
});
