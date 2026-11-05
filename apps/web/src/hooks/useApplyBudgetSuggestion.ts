import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { BudgetApplySuggestionResponse } from '../types/budget.types';

export function useApplyBudgetSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<BudgetApplySuggestionResponse>(
        `/budget/suggestions/${id}/apply`
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-suggestions'] });
    },
  });
}
