import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface CampaignLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
  campaignId?: string;
  campaignName?: string;
}

interface CampaignLeadsResponse {
  success: boolean;
  data: CampaignLead[];
  degraded?: boolean;
  firstSyncPending?: boolean;
  staleForMs?: number | null;
}

/**
 * Busca leads de formulário (fonte: banco via endpoints v2).
 * - `campaignId` definido: GET /v2/campaigns/:id/leads (campanha específica).
 * - `campaignId` null + `all=true`: GET /v2/leads (agregado de todas as
 *   campanhas de Formulário, usado na visão "Todas as campanhas" da página de Leads).
 */
export function useCampaignLeads(campaignId: string | null, enabled: boolean, all = false) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['campaigns/leads', campaignId ?? 'all'],
    queryFn: async () => {
      const url = campaignId ? `/v2/campaigns/${campaignId}/leads` : '/v2/leads';
      const response = await api.get<CampaignLeadsResponse>(url);
      return response.data;
    },
    enabled: enabled && (all || Boolean(campaignId)),
    staleTime: 60_000,
    refetchInterval: (query) => query.state.data?.degraded ? 30_000 : false,
  });

  return {
    leads: (data?.data ?? []) as CampaignLead[],
    degraded: data?.degraded ?? false,
    firstSyncPending: data?.firstSyncPending ?? false,
    staleForMs: data?.staleForMs ?? null,
    isLoading: enabled && isLoading,
    isError,
    errorMessage:
      (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? null,
  };
}
