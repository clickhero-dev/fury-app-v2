/* @vitest-environment jsdom */
/*
 * Funcionalidade: excluir campanha indisponível
 * Cenário: a campanha já foi removida ou não está disponível no contexto atual
 * Dado que o DELETE retorna 404 CAMPAIGN_NOT_FOUND ou 400 CAMPAIGN_DELETED
 * Quando a mutação é executada
 * Então a UI trata o estado como concluído e invalida a lista sem erro técnico
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';
import { useDeleteCampaign } from './useDeleteCampaign';

const mockDelete = vi.hoisted(() => vi.fn());

vi.mock('../lib/api', () => ({
  default: { delete: mockDelete },
}));

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function apiError(status: number, code: string) {
  return new AxiosError('request failed', undefined, undefined, undefined, {
    status,
    data: { error: { code, message: 'client-safe message' } },
    statusText: 'error',
    headers: {},
    config: {} as never,
  });
}

describe('useDeleteCampaign', () => {
  it.each([
    [404, 'CAMPAIGN_NOT_FOUND'],
    [400, 'CAMPAIGN_DELETED'],
  ])('trata %s/%s como exclusão concluída', async (status, code) => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['campaigns', '2026-10-01', '2026-10-31'], {
      data: [{ id: 'campaign-1' }, { id: 'campaign-2' }],
    });
    queryClient.setQueryData(['campaigns', '2026-11-01', '2026-11-06'], {
      data: [{ id: 'campaign-1' }, { id: 'campaign-3' }],
    });
    mockDelete.mockRejectedValueOnce(apiError(status, code));

    const { result } = renderHook(() => useDeleteCampaign(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate('campaign-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['campaigns'] });
    expect(queryClient.getQueryData(['campaigns', '2026-10-01', '2026-10-31'])).toEqual({
      data: [{ id: 'campaign-2' }],
    });
    expect(queryClient.getQueryData(['campaigns', '2026-11-01', '2026-11-06'])).toEqual({
      data: [{ id: 'campaign-3' }],
    });
  });

  it('mantém erro de permissão como falha', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(['campaigns', '2026-11-01', '2026-11-06'], {
      data: [{ id: 'campaign-1' }],
    });
    mockDelete.mockRejectedValueOnce(apiError(403, 'FORBIDDEN'));

    const { result } = renderHook(() => useDeleteCampaign(), { wrapper: makeWrapper(queryClient) });
    result.current.mutate('campaign-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isSuccess).toBe(false);
    expect(queryClient.getQueryData(['campaigns', '2026-11-01', '2026-11-06'])).toEqual({
      data: [{ id: 'campaign-1' }],
    });
  });
});
