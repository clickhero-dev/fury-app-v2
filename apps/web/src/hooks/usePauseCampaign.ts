import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { CampaignApiStatus } from '../types/campaigns';

interface PauseCampaignRequest {
  id: string;
  action: 'pause' | 'resume';
}

export interface CampaignStatusUpdateResponse {
  success: boolean;
  data: {
    status: CampaignApiStatus;
  };
  timestamp: string;
}

export function usePauseCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, action }: PauseCampaignRequest) => {
      const response = await api.patch<CampaignStatusUpdateResponse>(
        `/campaigns/${id}/${action}`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}
