import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type { BudgetSuggestion, BudgetSuggestionsResponse } from '../types/budget.types';

export function useBudgetSuggestions(status?: 'pending' | 'applied' | 'rejected') {
  return useQuery({
    queryKey: ['budget-suggestions', status],
    queryFn: async (): Promise<BudgetSuggestion[]> => {
      const response = await api.get<BudgetSuggestionsResponse>('/budget/suggestions', {
        params: status ? { status } : {},
      });
      return response.data?.data?.suggestions ?? [];
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}