import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ReferenceImagePanel } from './ReferenceImagePanel';

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({ mockApiGet: vi.fn(), mockApiPost: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet, post: mockApiPost, put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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
    mockApiPost.mockReset();
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

  it('confirma a ocultação sem alterar a seleção', async () => {
    mockApiPost.mockResolvedValue({ data: { success: true } });
    const h = renderPanel({ templateId: 'm1' });
    const user = userEvent.setup();
    await screen.findByRole('button', { name: /remover imagem: modelo/i });
    await user.click(screen.getAllByRole('button', { name: /ocultar imagem/i })[0]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/biblioteca/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^ocultar$/i }));
    expect(mockApiPost).toHaveBeenCalledWith('/brand-kit/library/m1/hide-from-reference-panel');
    expect(h.onPickTemplate).not.toHaveBeenCalled();
    expect(h.onToggleArtPhoto).not.toHaveBeenCalled();
  });

  it('mostra erro sem esconder a imagem quando a gravação falha', async () => {
    mockApiPost.mockRejectedValue(new Error('falha'));
    renderPanel();
    const user = userEvent.setup();
    await screen.findAllByRole('button', { name: /usar imagem/i });
    await user.click(screen.getAllByRole('button', { name: /ocultar imagem/i })[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^ocultar$/i }));
    expect(await within(screen.getByRole('dialog')).findByText(/não foi possível ocultar/i)).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancelar/i }));
    expect(screen.getAllByRole('button', { name: /usar imagem/i })).toHaveLength(4);
  });

  it('não leva o erro da tentativa anterior para outro diálogo', async () => {
    mockApiPost.mockRejectedValue(new Error('falha'));
    renderPanel();
    const user = userEvent.setup();
    await screen.findAllByRole('button', { name: /usar imagem/i });
    await user.click(screen.getAllByRole('button', { name: /ocultar imagem/i })[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^ocultar$/i }));
    await within(screen.getByRole('dialog')).findByRole('alert');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancelar/i }));
    await user.click(screen.getAllByRole('button', { name: /ocultar imagem/i })[1]);
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('limpa a mensagem de sucesso ao abrir outra confirmação', async () => {
    mockApiPost.mockResolvedValue({ data: { success: true } });
    renderPanel();
    const user = userEvent.setup();
    await screen.findAllByRole('button', { name: /usar imagem/i });
    await user.click(screen.getAllByRole('button', { name: /ocultar imagem/i })[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^ocultar$/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/imagem ocultada/i);
    await user.click(screen.getAllByRole('button', { name: /ocultar imagem/i })[0]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explica quando todas as imagens elegíveis estão ocultas', async () => {
    mockApiGet.mockResolvedValue({ data: { success: true, data: [{ ...LIB[1], hidden_from_reference_panel: true }] } });
    renderPanel();
    expect(await screen.findByText(/imagens ocultas.*biblioteca/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma imagem ainda/i)).not.toBeInTheDocument();
  });

  it('atualiza mudanças de outra sessão enquanto montado e para ao desmontar', async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><ReferenceImagePanel templateId={null} artPhotoIds={[]} onToggleArtPhoto={vi.fn()} onUploadClick={vi.fn()} /></QueryClientProvider>);
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(screen.getAllByRole('button', { name: /usar imagem/i })).toHaveLength(4);
      mockApiGet.mockResolvedValue({ data: { success: true, data: LIB.map((p) => ({ ...p, hidden_from_reference_panel: true })) } });
      await act(async () => { await vi.advanceTimersByTimeAsync(30_100); });
      expect(screen.queryAllByRole('button', { name: /usar imagem/i })).toHaveLength(0);
      expect(screen.getByText(/imagens ocultas.*biblioteca/i)).toBeInTheDocument();
      view.unmount();
      const calls = mockApiGet.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(mockApiGet).toHaveBeenCalledTimes(calls);
    } finally { vi.useRealTimers(); client.clear(); }
  });

  it('não mostra imagens ocultas no painel e ajusta as contagens', async () => {
    mockApiGet.mockResolvedValue({ data: { success: true, data: [LIB[0], { ...LIB[1], hidden_from_reference_panel: true }] } });
    renderPanel();
    expect(await screen.findByRole('button', { name: /todas 1/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /usar imagem: produto/i })).not.toBeInTheDocument();
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
