// =============================================================================
// BDD — useLeadStatus (alteração manual de status de cliente)
/*
# Language: pt-BR

Funcionalidade: Hook de alteração de status do cliente (transições livres)

  Cenário: altera o status com PATCH e atualiza o cache local
    Dado um lead com status 'novo'
    Quando useLeadStatus.mutate({ id, status: 'negociando' })
    Então PATCH /v2/leads/:id/status é chamado com { status: 'negociando' }
    E o cache de leads é atualizado otimisticamente

  Cenário: erro no PATCH reverte o status no cache
    Dado PATCH rejeitado
    Quando a mutation falha
    Então o status anterior é restaurado
*/
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLeadStatus, LEAD_STATUS_OPTIONS } from './useLeadStatus';

const mockApiPatch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: mockApiPatch,
    delete: vi.fn(),
  },
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['campaigns/leads', 'all'], {
    data: [{ id: 'l1', name: 'Maria', status: 'novo' }],
  });
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

describe('useLeadStatus', () => {
  beforeEach(() => {
    mockApiPatch.mockReset();
  });

  it('contém os 6 status do funil em ordem', () => {
    expect(LEAD_STATUS_OPTIONS).toEqual([
      'novo',
      'não contatado',
      'tentativa de contato',
      'negociando',
      'comprou',
      'não comprou',
    ]);
  });

  it('altera o status com PATCH e atualiza o cache otimisticamente', async () => {
    mockApiPatch.mockResolvedValue({ data: { success: true, data: { id: 'l1', status: 'negociando' } } });
    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeadStatus(), { wrapper });

    act(() => {
      result.current.mutate({ id: 'l1', status: 'negociando' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiPatch).toHaveBeenCalledWith('/v2/leads/l1/status', { status: 'negociando' });
    const cached = qc.getQueryData(['campaigns/leads', 'all']) as {
      data: Array<{ id: string; status: string }>;
    };
    expect(cached.data[0].status).toBe('negociando');
  });

  it('erro no PATCH reverte o status no cache', async () => {
    mockApiPatch.mockRejectedValue(new Error('boom'));
    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeadStatus(), { wrapper });

    act(() => {
      result.current.mutate({ id: 'l1', status: 'comprou' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = qc.getQueryData(['campaigns/leads', 'all']) as {
      data: Array<{ id: string; status: string }>;
    };
    expect(cached.data[0].status).toBe('novo');
  });
});