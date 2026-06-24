import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { BudgetConfigResponse, UpdateBudgetConfigPayload } from '../types/budget.types';

export function useUpdateBudgetConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateBudgetConfigPayload) => {
      const response = await api.patch<BudgetConfigResponse>('/budget/config', data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-config'] });
    },
  });
}
