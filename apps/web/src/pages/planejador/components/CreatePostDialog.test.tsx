import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreatePostDialog } from './CreatePostDialog';

/**
 * Regressão: colisão de cache do react-query na chave `['studio/assets']`.
 * O EstudioHome cacheia o CORPO COMPLETO da resposta (`{ assets, total, ... }`);
 * o CreatePostDialog lia `response.data.assets` como se fosse o array. Com o
 * cache do EstudioHome quente, `studioAssetsData` virava o objeto → `.filter is
 * not a function`. O diálogo precisa ler `data.assets`.
 */

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    get: mockApiGet,
    post: mockApiPost,
    defaults: { baseURL: 'https://api.ady.example.com' },
  },
}));

const FULL_BODY = {
  assets: [
    { id: 'a1', type: 'image', url: 'https://cdn.example.com/a.png', complianceStatus: 'approved' },
  ],
  total: 1,
  page: 1,
  totalPages: 1,
  creativesRemaining: 5,
  creativesLimit: 10,
};

function renderDialog(queryClient?: QueryClient) {
  const qc = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CreatePostDialog mode="now" onClose={() => {}} onCreated={() => {}} />
    </QueryClientProvider>,
  );
}

describe('CreatePostDialog — resposta de /studio/assets', () => {
  it('não quebra quando o cache [studio/assets] contém o corpo completo (populado pelo EstudioHome)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    // Simula o cache quente do EstudioHome: mesma chave, corpo completo.
    qc.setQueryData(['studio/assets'], FULL_BODY);

    renderDialog(qc);

    const libraryBtn = await screen.findByRole('button', { name: /Biblioteca do Estúdio/i });
    libraryBtn.click();

    // A imagem aprovada aparece — prova que leu `data.assets`, sem "filter is not a function".
    expect(await screen.findByAltText('Asset do Estúdio')).toBeTruthy();
  });

  it('mostra estado vazio quando o corpo completo não tem imagem aprovada', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    qc.setQueryData(['studio/assets'], {
      assets: [{ id: 'c1', type: 'copy', url: null, complianceStatus: 'approved' }],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    renderDialog(qc);

    const libraryBtn = await screen.findByRole('button', { name: /Biblioteca do Estúdio/i });
    libraryBtn.click();

    expect(await screen.findByText(/Nenhuma imagem na biblioteca/i)).toBeTruthy();
  });

  /*
  Funcionalidade: legenda assistida no Planejador

    Cenário: gerar a partir de tema
      Dado um tema escrito no campo Legenda
      Quando a pessoa clica em Gerar legenda com IA
      Então a sugestão preenche a textarea e continua editável sem salvar o post

    Cenário: ausência de contexto
      Dado que não há imagem nem tema
      Quando o diálogo é aberto
      Então o botão de geração fica desabilitado
  */
  it('Cenário: tema gera legenda editável sem criar ou publicar post', async () => {
    mockApiGet.mockResolvedValue({ data: { assets: [] } });
    mockApiPost.mockResolvedValueOnce({ data: { success: true, data: { caption: 'Sugestão pronta.', imageUsed: false } } });
    renderDialog();

    const textarea = screen.getByPlaceholderText('Escreva a legenda do post...');
    expect(screen.getByRole('button', { name: /Gerar legenda com IA/i })).toBeDisabled();
    fireEvent.change(textarea, { target: { value: 'Promoção de verão' } });
    fireEvent.click(screen.getByRole('button', { name: /Gerar legenda com IA/i }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/planner/posts/suggest-caption', { context: 'Promoção de verão' }));
    expect(textarea).toHaveValue('Sugestão pronta.');
    fireEvent.change(textarea, { target: { value: 'Sugestão editada.' } });
    expect(textarea).toHaveValue('Sugestão editada.');
  });
});
