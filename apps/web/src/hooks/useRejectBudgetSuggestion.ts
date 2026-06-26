import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { BudgetRejectSuggestionResponse } from '../types/budget.types';

export function useRejectBudgetSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<BudgetRejectSuggestionResponse>(
        `/budget/suggestions/${id}/reject`
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-suggestions'] });
    },
  });
}
