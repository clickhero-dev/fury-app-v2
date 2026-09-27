import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface LeadCampaignOption {
  id: string;
  name: string;
}

interface CampaignsResponse {
  success: boolean;
  data: Array<{ id: string; name: string; objective?: string | null }>;
  degraded?: boolean;
  firstSyncPending?: boolean;
  staleForMs?: number | null;
}

/** Campanhas do objetivo Formulário (OUTCOME_LEADS) para o filtro da página de Leads. */
export function useLeadCampaigns() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['campaigns/leads/filter'],
    queryFn: async () => {
      // Fonte: banco (endpoints v2) — o backend sincroniza OUTCOME_LEADS da
      // conta de anúncios (inclui campanhas criadas fora do Fury). O `id`
      // retornado é o meta campaign id, usado em GET /v2/campaigns/:id/leads.
      const response = await api.get<CampaignsResponse>('/v2/lead-campaigns');
      const items = response.data?.data ?? [];
      return {
        campaigns: items.map((c) => ({ id: c.id, name: c.name })),
        degraded: response.data?.degraded ?? false,
        firstSyncPending: response.data?.firstSyncPending ?? false,
        staleForMs: response.data?.staleForMs ?? null,
      };
    },
    staleTime: 60_000,
    refetchInterval: (query) => query.state.data?.degraded ? 30_000 : false,
  });

  return {
    campaigns: (data?.campaigns ?? []) as LeadCampaignOption[],
    isLoading,
    isError,
    degraded: data?.degraded ?? false,
    firstSyncPending: data?.firstSyncPending ?? false,
    staleForMs: data?.staleForMs ?? null,
  };
}
