import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { campanhasMock, type CampaignData } from '../lib/campanhas-mock';

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async (): Promise<CampaignData[]> => {
      try {
        const response = await api.get<CampaignData[]>('/metrics/campaigns');
        return response.data;
      } catch (error) {
        console.warn('Failed to fetch campaigns, using mock data:', error);
        return campanhasMock;
      }
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}
