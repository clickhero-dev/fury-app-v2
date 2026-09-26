// =============================================================================
// BDD — T007: Frontend consome endpoints v2 (troca de path, contratos mantidos)
//
/*
# Language: pt-BR

Funcionalidade: Frontend passa a chamar /v2/* para dados Meta do banco

  Cenário: useCampaignLeads com campaignId chama /v2/campaigns/:id/leads
    Dado hook montado com campaignId definido
    Quando a query executa
    Então api.get é chamado com '/v2/campaigns/m1/leads'

  Cenário: useCampaignLeads all chama /v2/leads
    Dado hook montado com all=true e campaignId null
    Quando a query executa
    Então api.get é chamado com '/v2/leads'

  Cenário: useLeadCampaigns chama /v2/lead-campaigns
    Dado hook montado
    Quando a query executa
    Então api.get é chamado com '/v2/lead-campaigns'
*/
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCampaignLeads } from './useCampaignLeads';
import { useLeadCampaigns } from './useLeadCampaigns';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('BDD: hooks de campanhas/leads usam /v2/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: { data: [] } });
  });

  it('Cenário: useCampaignLeads com campaignId chama /v2/campaigns/:id/leads', async () => {
    renderHook(() => useCampaignLeads('m1', true), { wrapper });
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(mockApiGet).toHaveBeenCalledWith('/v2/campaigns/m1/leads');
  });

  it('Cenário: useCampaignLeads all=true chama /v2/leads', async () => {
    renderHook(() => useCampaignLeads(null, true, true), { wrapper });
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(mockApiGet).toHaveBeenCalledWith('/v2/leads');
  });

  it('Cenário: useLeadCampaigns chama /v2/lead-campaigns', async () => {
    mockApiGet.mockResolvedValue({
      data: { data: [{ id: 'm1', name: 'Camp 1' }] },
    });
    const { result } = renderHook(() => useLeadCampaigns(), { wrapper });
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(mockApiGet).toHaveBeenCalledWith('/v2/lead-campaigns');
    await waitFor(() => expect(result.current.campaigns.length).toBe(1));
    expect(result.current.campaigns[0]).toMatchObject({ id: 'm1', name: 'Camp 1' });
  });
});