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
      const response = await api.get<CampaignsResponse>('/campaigns', { params: { limit: 100 } });
      const items = response.data?.data ?? [];
      return items
        .filter((c) => c.objective === 'OUTCOME_LEADS')
        .map((c) => ({ id: c.id, name: c.name }));
    },
    staleTime: 60_000,
  });

  return {
    campaigns: (data ?? []) as LeadCampaignOption[],
    isLoading,
    isError,
  };
}