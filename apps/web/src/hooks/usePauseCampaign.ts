import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

interface PauseCampaignRequest {
  id: string;
  action: 'pause' | 'resume';
}

export function usePauseCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, action }: PauseCampaignRequest) => {
      try {
        const response = await api.patch(`/api/campaigns/${id}/${action}`);
        return response.data;
      } catch (error) {
        console.warn(`Failed to ${action} campaign ${id}:`, error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}
