//
// Funcionalidade: carregar o Brand Kit sem mascarar falhas reais
// Cenário: tenant ainda não possui Brand Kit
// Dado que GET /brand-kit responde 404
// Quando o hook é montado
// Então ele expõe estado vazio sem erro
//
// Cenário: falha transitória ao carregar o Brand Kit
// Dado que GET /brand-kit responde 503
// Quando o hook é montado
// Então ele expõe erro e oferece nova tentativa sem criar dados padrão
//
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useBrandKit } from './useBrandKit';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet, put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useBrandKit', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    client.clear();
  });

  it('trata 404 como estado vazio utilizável', async () => {
    mockApiGet.mockRejectedValue({ response: { status: 404 } });
    const { result } = renderHook(() => useBrandKit(), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));

    expect(result.current.brandKit).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('preserva a falha e expõe retry em erro diferente de 404', async () => {
    mockApiGet.mockRejectedValue({ response: { status: 503 } });
    const { result } = renderHook(() => useBrandKit(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.brandKit).toBeNull();
    expect(result.current.refetch).toEqual(expect.any(Function));
    expect(mockApiGet).toHaveBeenCalledWith('/brand-kit');
  });
});
