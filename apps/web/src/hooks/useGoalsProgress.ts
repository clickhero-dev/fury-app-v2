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
  status: 'on_track' | 'at_risk' | 'off_track';
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

const today = new Date();
const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
const elapsed = today.getDate();

function makeSpark(base: number, trend: number, count = 7) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (count - 1 - i));
    return {
      date: d.toISOString().split('T')[0],
      value: Math.max(0, Math.round(base + trend * i + (Math.random() - 0.5) * base * 0.3)),
    };
  });
}

const MOCK_DATA: GoalsProgressData = {
  objective: 'gerar_leads',
  days_elapsed: elapsed,
  days_remaining: daysInMonth - elapsed,
  days_in_month: daysInMonth,
  goals: [
    {
      id: 'conversions',
      name: 'Conversões',
      metric: 'conversions',
      unit: 'conv.',
      target_value: 200,
      current_value: 94,
      progress_pct: 47,
      projected_value: Math.round((94 / elapsed) * daysInMonth),
      deadline: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0],
      status: 'at_risk',
      sparkline: makeSpark(12, 0.5),
    },
    {
      id: 'budget',
      name: 'Orçamento',
      metric: 'spend',
      unit: 'R$',
      target_value: 8000,
      current_value: 4850,
      progress_pct: 61,
      projected_value: Math.round((4850 / elapsed) * daysInMonth),
      deadline: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0],
      status: 'on_track',
      sparkline: makeSpark(650, 10),
    },
    {
      id: 'roas',
      name: 'ROAS',
      metric: 'roas',
      unit: 'x',
      target_value: 3.0,
      current_value: 3.2,
      progress_pct: 100,
      projected_value: 3.2,
      deadline: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0],
      status: 'on_track',
      sparkline: makeSpark(3, 0.05),
    },
  ],
  ideal_line: Array.from({ length: elapsed }, (_, i) => ({
    date: (() => { const d = new Date(today.getFullYear(), today.getMonth(), i + 1); return d.toISOString().split('T')[0]; })(),
    real: Math.round((94 / elapsed) * (i + 1) * (0.85 + Math.random() * 0.3)),
    ideal: Math.round((200 / daysInMonth) * (i + 1) * 10) / 10,
  })),
  alerts: [
    {
      campaignId: 'c1',
      campaignName: 'Prospecção Fria',
      metric: 'CPA',
      current_value: 86.2,
      target_value: 50,
      deviation_pct: 72,
      type: 'cpa_high',
    },
    {
      campaignId: 'c2',
      campaignName: 'Lookalike 2%',
      metric: 'ROAS',
      current_value: 1.4,
      target_value: 3.0,
      deviation_pct: -53,
      type: 'roas_low',
    },
  ],
  primary_goal: {
    id: 'conversions',
    name: 'Conversões',
    metric: 'conversions',
    unit: 'conv.',
    target_value: 200,
    current_value: 94,
    progress_pct: 47,
    projected_value: Math.round((94 / elapsed) * daysInMonth),
    deadline: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0],
    status: 'at_risk',
    sparkline: makeSpark(12, 0.5),
  },
};

export function useGoalsProgress() {
  return useQuery<GoalsProgressData>({
    queryKey: ['goals-progress-v2'],
    queryFn: async () => {
      const res = await api.get<{ data: GoalsProgressData }>('/goals/progress');
      return res.data.data;
    },
    refetchInterval: 5 * 60 * 1000,
    placeholderData: MOCK_DATA,
    retry: 1,
    select: (data) => data ?? MOCK_DATA,
  });
}
