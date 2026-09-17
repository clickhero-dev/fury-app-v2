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

function renderPanel(contextUrls: string[] = [], onAdd = vi.fn(), onRemove = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const utils = render(
    <ReferenceImagePanel contextUrls={contextUrls} onAdd={onAdd} onRemove={onRemove} />,
    { wrapper },
  );
  return { ...utils, onAdd, onRemove };
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
    const { onAdd } = renderPanel();
    const user = userEvent.setup();
    await screen.findAllByRole('button', { name: /selecionar imagem de referência/i });

    const file = new File(['conteudo'], 'produto-novo.png', { type: 'image/png' });
    const input = screen.getByLabelText(/enviar fotos/i);
    await user.upload(input, file);

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/brand-kit/photos', expect.any(FormData), expect.anything());
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('clicar numa miniatura já chama onAdd na hora, sem passo de confirmação', async () => {
    const { onAdd } = renderPanel();
    const user = userEvent.setup();
    const thumbs = await screen.findAllByRole('button', { name: /selecionar imagem de referência/i });

    await user.click(thumbs[0]);

    expect(onAdd).toHaveBeenCalledWith([PHOTO_URLS[0]]);
    // Não existe mais botão de confirmação
    expect(screen.queryByRole('button', { name: /adicionar à criação/i })).not.toBeInTheDocument();
  });

  it('miniatura já presente no contexto aparece selecionada, e clicar nela chama onRemove', async () => {
    const { onRemove } = renderPanel([PHOTO_URLS[1]]);
    const user = userEvent.setup();
    const thumbs = await screen.findAllByRole('button', { name: /selecionar imagem de referência/i });

    expect(thumbs[1]).toHaveAttribute('aria-pressed', 'true');
    expect(thumbs[0]).toHaveAttribute('aria-pressed', 'false');

    await user.click(thumbs[1]);
    expect(onRemove).toHaveBeenCalledWith(PHOTO_URLS[1]);
  });

  it('sem fotos na biblioteca, não mostra grade nenhuma', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/brand-kit') return Promise.resolve({ data: { data: { photo_urls: [] } } });
      return Promise.reject(new Error('unexpected'));
    });
    renderPanel();
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/brand-kit'));
    expect(screen.queryByRole('button', { name: /selecionar imagem de referência/i })).not.toBeInTheDocument();
  });
});
