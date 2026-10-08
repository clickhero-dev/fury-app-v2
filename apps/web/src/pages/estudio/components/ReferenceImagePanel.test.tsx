import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ReferenceImagePanel } from './ReferenceImagePanel';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const LIB = [
  { id: 'm1', kind: 'modelo', url: 'https://cdn/m1.png', created_at: '2026-10-07' },
  { id: 'p1', kind: 'produto', url: 'https://cdn/p1.png', created_at: '2026-10-07' },
  { id: 'p2', kind: 'produto', url: 'https://cdn/p2.png', created_at: '2026-10-07' },
  { id: 'e1', kind: 'equipe', url: 'https://cdn/e1.png', created_at: '2026-10-07' },
];

function renderPanel(props: Partial<React.ComponentProps<typeof ReferenceImagePanel>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const handlers = {
    onPickTemplate: vi.fn(),
    onToggleArtPhoto: vi.fn(),
    onUploadClick: vi.fn(),
  };
  render(<ReferenceImagePanel templateId={null} artPhotoIds={[]} {...handlers} {...props} />, { wrapper });
  return handlers;
}

describe('ReferenceImagePanel', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/brand-kit/library') return Promise.resolve({ data: { success: true, data: LIB } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('mostra a biblioteca com etiqueta do tipo e filtros com contagem', async () => {
    renderPanel();
    const tiles = await screen.findAllByRole('button', { name: /usar imagem/i });
    expect(tiles).toHaveLength(4);
    expect(within(tiles[0]).getByText('Modelo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /todas 4/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /produtos 2/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /equipe 1/i })).toBeInTheDocument();
  });

  it('filtrar mostra só o tipo escolhido e "Limpar filtro" volta para todas', async () => {
    renderPanel();
    const user = userEvent.setup();
    await screen.findAllByRole('button', { name: /usar imagem/i });
    expect(screen.queryByRole('button', { name: /limpar filtro/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /produtos 2/i }));
    expect(screen.getAllByRole('button', { name: /usar imagem: produto/i })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /usar imagem: modelo/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /limpar filtro/i }));
    expect(screen.getAllByRole('button', { name: /usar imagem/i })).toHaveLength(4);
  });

  it('clicar num modelo escolhe o modelo; num produto/equipe coloca na arte', async () => {
    const h = renderPanel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /usar imagem: modelo/i }));
    expect(h.onPickTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
    await user.click(screen.getByRole('button', { name: /usar imagem: equipe/i }));
    expect(h.onToggleArtPhoto).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });

  it('marca como selecionados o modelo e as fotos da criação', async () => {
    renderPanel({ templateId: 'm1', artPhotoIds: ['p2'] });
    expect(await screen.findByRole('button', { name: /remover imagem: modelo/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /remover imagem: produto/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: /usar imagem/i })).toHaveLength(2);
  });

  it('"Enviar imagens" pede o envio geral', async () => {
    const h = renderPanel();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /enviar imagens/i }));
    expect(h.onUploadClick).toHaveBeenCalled();
  });
});
