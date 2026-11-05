/*
Funcionalidade: atualizar a lista v2 após criar campanha no Ady
  Cenário: criação concluída invalida a lista cacheada
    Dado o hook de criação montado no QueryClient da tela
    Quando a Meta confirma a criação da campanha
    Então a query de campanhas é invalidada para ler o snapshot v2 atualizado
*/
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateCampaign } from './useCreateCampaign';

const mockPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { post: mockPost } }));

describe('useCreateCampaign', () => {
  it('Cenário: invalida a lista após criação confirmada', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    mockPost.mockResolvedValueOnce({ data: { success: true } });
    const { result } = renderHook(() => useCreateCampaign(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({} as any);
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['campaigns'] }));
  });
});
