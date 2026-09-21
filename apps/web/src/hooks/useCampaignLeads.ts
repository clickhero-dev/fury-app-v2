import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface CampaignLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
}

interface CampaignLeadsResponse {
  success: boolean;
  data: CampaignLead[];
}

export function useCampaignLeads(campaignId: string | null, enabled: boolean) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['campaigns/leads', campaignId],
    queryFn: async () => {
      const response = await api.get<CampaignLeadsResponse>(`/campaigns/${campaignId}/leads`);
      return response.data.data;
    },
    enabled: enabled && Boolean(campaignId),
    staleTime: 60_000,
  });

  return {
    leads: data ?? [],
    isLoading: enabled && isLoading,
    isError,
    errorMessage:
      (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null,
  };
}
