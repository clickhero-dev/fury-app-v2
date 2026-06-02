import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';

export interface AutomationRules {
  pauseHighCpa: boolean;
  pauseHighCpaThreshold: number;
  pauseLowRoas: boolean;
  pauseLowRoasThreshold: number;
  pauseNoConversions: boolean;
  pauseNoConversionsSpending: number;
}

export function useSaveAutomationRules() {
  return useMutation({
    mutationFn: async (rules: AutomationRules) => {
      try {
        const response = await api.post('/automation/rules', rules);
        return response.data;
      } catch (error) {
        console.warn('Failed to save automation rules:', error);
        throw error;
      }
    },
  });
}
