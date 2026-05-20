import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export type FuryConfig = {
  id: string;
  tenantId: string;
  targetRoas: string;
  targetCpa: string;
  targetCtr: string;
  targetBudgetUtilization: string;
  updatedAt: string;
};

export type UpdateFuryConfigPayload = {
  targetRoas?: number;
  targetCpa?: number;
  targetCtr?: number;
  targetBudgetUtilization?: number;
};

export function useFuryConfig() {
  return useQuery<FuryConfig>({
    queryKey: ['fury-config'],
    queryFn: async () => {
      const res = await api.get<{ data: FuryConfig }>('/fury/config');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateFuryConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateFuryConfigPayload) => {
      const res = await api.patch<{ data: FuryConfig }>('/fury/config', payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['fury-config'], data);
    },
  });
}
