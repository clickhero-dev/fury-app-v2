import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface GoalItem {
  id: string;
  name: string;
  metric: string;
  unit: string;
  target_value: number;
  current_value: number;
  progress_pct: number;
  projected_value: number;
  deadline: string;
  status: 'on_track' | 'at_risk' | 'off_track' | 'no_goals';
  sparkline: { date: string; value: number }[];
}

export interface FuryAlert {
  campaignId: string;
  campaignName: string;
  metric: string;
  current_value: number;
  target_value: number;
  deviation_pct: number;
  type: 'cpa_high' | 'roas_low' | 'spend_low';
}

export interface IdealLinePoint {
  date: string;
  real: number;
  ideal: number;
}

export interface GoalsProgressData {
  hasGoals: boolean;
  objective: string;
  goals: GoalItem[];
  primary_goal: GoalItem;
  days_elapsed: number;
  days_remaining: number;
  days_in_month: number;
  ideal_line: IdealLinePoint[];
  alerts: FuryAlert[];
}

const OBJECTIVES: Record<string, string> = {
  aumentar_vendas: 'Aumentar Vendas',
  gerar_leads: 'Gerar Leads',
  aumentar_awareness: 'Aumentar Awareness',
  maximizar_roas: 'Maximizar ROAS',
  reduzir_cpa: 'Reduzir CPA',
};

export function translateObjective(key?: string) {
  return (key && OBJECTIVES[key]) ?? key ?? 'Seu Objetivo';
}

export function useGoalsProgress(startDate?: string, endDate?: string) {
  return useQuery<GoalsProgressData | null>({
    queryKey: ['goals-progress-v2', startDate, endDate],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await api.get<{ data: GoalsProgressData }>('/goals/progress', { params });
      return res.data.data ?? null;
    },
    refetchInterval: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    retry: 1,
  });
}
