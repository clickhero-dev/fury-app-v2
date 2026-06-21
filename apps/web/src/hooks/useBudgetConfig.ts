import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type { BudgetConfig, BudgetConfigResponse } from '../types/budget.types';

export function useBudgetConfig() {
  return useQuery({
    queryKey: ['budget-config'],
    queryFn: async (): Promise<BudgetConfig> => {
      try {
        const response = await api.get<BudgetConfigResponse>('/budget/config');
        return response.data?.data ?? { tenantId: '', mode: 'suggestion', totalBudget: 0, autoApplyEnabled: false };
      } catch (error) {
        console.warn('Failed to fetch budget config:', error);
        return { tenantId: '', mode: 'suggestion', totalBudget: 0, autoApplyEnabled: false };
      }
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
