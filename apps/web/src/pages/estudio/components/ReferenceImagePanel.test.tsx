import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ReferenceImagePanel } from './ReferenceImagePanel';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    get: mockApiGet,
    post: mockApiPost,
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const PHOTO_URLS = ['https://cdn/produto.png', 'https://cdn/pessoa.png', 'https://cdn/bolsa.png'];

function renderPanel(onAddToContext = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const utils = render(<ReferenceImagePanel onAddToContext={onAddToContext} />, { wrapper });
  return { ...utils, onAddToContext };
}

describe('ReferenceImagePanel', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/brand-kit') {
        return Promise.resolve({ data: { data: { photo_urls: PHOTO_URLS } } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    mockApiPost.mockResolvedValue({ data: { data: { urls: ['https://cdn/nova.png'] } } });
  });

  it('renderiza a galeria com as fotos já salvas na biblioteca, sem nome/legenda', async () => {
    renderPanel();
    const thumbs = await screen.findAllByRole('button', { name: /selecionar imagem de referência/i });
    expect(thumbs).toHaveLength(3);
    // Só imagem — nenhum texto de nome de arquivo visível nas miniaturas
    thumbs.forEach((btn) => expect(btn).not.toHaveTextContent(/\w/));
  });

  it('upload chama POST /brand-kit/photos com os arquivos e não afeta o contexto (Upload A)', async () => {
    const { onAddToContext } = renderPanel();
    const user = userEvent.setup();
    await screen.findAllByRole('button', { name: /selecionar imagem de referência/i });

    const file = new File(['conteudo'], 'produto-novo.png', { type: 'image/png' });
    const input = screen.getByLabelText(/enviar fotos/i);
    await user.upload(input, file);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/brand-kit/photos', expect.any(FormData), expect.anything());
    });
    expect(onAddToContext).not.toHaveBeenCalled();
  });

  it('seleciona até 2 miniaturas, bloqueia a 3ª, e confirmar chama onAddToContext com as URLs certas', async () => {
    const { onAddToContext } = renderPanel();
    const user = userEvent.setup();
    const thumbs = await screen.findAllByRole('button', { name: /selecionar imagem de referência/i });

    await user.click(thumbs[0]);
    await user.click(thumbs[1]);
    expect(thumbs[0]).toHaveAttribute('aria-pressed', 'true');
    expect(thumbs[1]).toHaveAttribute('aria-pressed', 'true');

    // 3ª fica desabilitada com 2 já selecionadas
    expect(thumbs[2]).toBeDisabled();
    await user.click(thumbs[2]);
    expect(thumbs[2]).toHaveAttribute('aria-pressed', 'false');

    const confirmBtn = screen.getByRole('button', { name: /adicionar à criação/i });
    await user.click(confirmBtn);

    expect(onAddToContext).toHaveBeenCalledWith([PHOTO_URLS[0], PHOTO_URLS[1]]);
    // seleção local limpa após confirmar
    expect(screen.queryByRole('button', { name: /adicionar à criação/i })).not.toBeInTheDocument();
  });

  it('sem fotos na biblioteca, não mostra grade nem botão de confirmar', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/brand-kit') return Promise.resolve({ data: { data: { photo_urls: [] } } });
      return Promise.reject(new Error('unexpected'));
    });
    renderPanel();
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/brand-kit'));
    expect(screen.queryByRole('button', { name: /selecionar imagem de referência/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /adicionar à criação/i })).not.toBeInTheDocument();
  });
});
