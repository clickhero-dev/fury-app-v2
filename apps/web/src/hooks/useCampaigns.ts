import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { campanhasMock } from '../lib/campanhas-mock';
import {
  mapCampaignApiToRow,
  type CampaignApiItem,
  type CampaignData,
  type CampaignsApiResponse,
} from '../types/campaigns';

function normalizeCampaignItems(data: unknown): CampaignApiItem[] {
  if (Array.isArray(data)) {
    return data as CampaignApiItem[];
  }
  if (data && typeof data === 'object' && Array.isArray((data as { campaigns?: unknown }).campaigns)) {
    return (data as { campaigns: CampaignApiItem[] }).campaigns;
  }
  return [];
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async (): Promise<CampaignData[]> => {
      try {
        const response = await api.get<CampaignsApiResponse>('/metrics/campaigns', {
          params: { limit: 100 },
        });
        const items = normalizeCampaignItems(response.data?.data);
        if (items.length === 0) return [];
        return items.map(mapCampaignApiToRow);
      } catch (error) {
        console.warn('Failed to fetch campaigns, using mock data:', error);
        return campanhasMock;
      }
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}
