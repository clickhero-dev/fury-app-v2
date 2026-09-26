import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface LeadCampaignOption {
  id: string;
  name: string;
}

interface CampaignsResponse {
  success: boolean;
  data: Array<{ id: string; name: string; objective?: string | null }>;
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
      return items.map((c) => ({ id: c.id, name: c.name }));
    },
    staleTime: 60_000,
  });

  return {
    campaigns: (data ?? []) as LeadCampaignOption[],
    isLoading,
    isError,
  };
}