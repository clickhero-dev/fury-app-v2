//
// Funcionalidade: biblioteca de imagens do Estúdio
// Cenário: resposta vazia
// Dado que GET /brand-kit/library responde com uma lista vazia
// Quando a biblioteca é carregada
// Então o hook retorna a lista vazia sem erro
//
// Cenário: API retorna mensagem de validação na raiz
// Dado que um lote é rejeitado com { message: '...' }
// Quando o upload é executado
// Então a mensagem client-safe é preservada para a tela oferecer retry
//
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LibraryUploadError, useStudioLibrary, useUploadLibraryPhotos } from './useStudioLibrary';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({ default: { get: mockApiGet, post: mockApiPost } }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('hooks da biblioteca do Estúdio', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
  });

  it('mantém a lista vazia como estado normal', async () => {
    mockApiGet.mockResolvedValue({ data: { success: true, data: [] } });
    const { result } = renderHook(() => useStudioLibrary(), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));

    expect(result.current.data).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it('preserva mensagem de erro na raiz para upload inválido', async () => {
    mockApiPost.mockRejectedValue({ response: { data: { message: 'Envie no máximo 20 imagens por vez.' } } });
    const { result } = renderHook(() => useUploadLibraryPhotos(), { wrapper });
    const file = new File(['png'], 'foto.png', { type: 'image/png' });

    act(() => result.current.mutate({ kind: 'modelo', files: [file] }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(LibraryUploadError);
    expect(result.current.error?.message).toBe('Envie no máximo 20 imagens por vez.');
  });
});
