import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

/** Meta individual com progresso atual e projeção. */
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
  /** Status da meta em relação ao progresso esperado para o período. */
  status: 'on_track' | 'at_risk' | 'off_track' | 'no_goals';
  /** Histórico de valores diários para exibição do gráfico sparkline. */
  sparkline: { date: string; value: number }[];
}

/** Alerta gerado pelo FURY Engine quando uma campanha desvia das metas. */
export interface FuryAlert {
  campaignId: string;
  campaignName: string;
  metric: string;
  current_value: number;
  target_value: number;
  deviation_pct: number;
  /** Tipo do alerta: CPA acima da meta, ROAS abaixo da meta ou gasto abaixo do esperado. */
  type: 'cpa_high' | 'roas_low' | 'spend_low';
}

/** Ponto da linha ideal de progresso para comparação com o valor real. */
export interface IdealLinePoint {
  date: string;
  real: number;
  ideal: number;
}

/** Dados completos de progresso das metas do tenant. */
export interface GoalsProgressData {
  hasGoals: boolean;
  objective: string;
  goals: GoalItem[];
  /** Meta principal do tenant, usada como destaque no Dashboard. */
  primary_goal: GoalItem;
  days_elapsed: number;
  days_remaining: number;
  days_in_month: number;
  /** Linha de progresso ideal vs real ao longo do mês. */
  ideal_line: IdealLinePoint[];
  /** Alertas de campanhas fora das metas configuradas. */
  alerts: FuryAlert[];
}

/** Mapa de chaves de objetivo para labels legíveis em português. */
const OBJECTIVES: Record<string, string> = {
  aumentar_vendas: 'Aumentar Vendas',
  gerar_leads: 'Pessoas Alcançadas',
  aumentar_awareness: 'Ser Mais Visto',
  maximizar_roas: 'Melhor Resultado',
  reduzir_cpa: 'Menor Custo por Pessoa',
};

/**
 * Traduz a chave de objetivo vinda da API para um label legível em português.
 *
 * @param key - Chave do objetivo (ex: `'aumentar_vendas'`)
 * @returns Label traduzido ou a própria chave se não encontrada
 *
 * @example
 * translateObjective('maximizar_roas') // → 'Maximizar ROAS'
 * translateObjective(undefined)        // → 'Seu Objetivo'
 */
export function translateObjective(key?: string) {
  return (key && OBJECTIVES[key]) ?? key ?? 'Seu Objetivo';
}

/**
 * Hook para buscar o progresso das metas do tenant autenticado.
 *
 * - Atualiza automaticamente a cada 5 minutos.
 * - Mantém os dados anteriores visíveis enquanto busca novos (placeholderData).
 * - Faz apenas 1 tentativa em caso de erro.
 * - Retorna `null` se a API não retornar dados.
 *
 * @param startDate - Data inicial do período no formato YYYY-MM-DD (opcional)
 * @param endDate - Data final do período no formato YYYY-MM-DD (opcional)
 * @returns Resultado do React Query com `GoalsProgressData` ou `null`
 *
 * @example
 * const { data, isLoading } = useGoalsProgress('2026-06-01', '2026-06-30');
 */
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
    refetchInterval: 5 * 60 * 1000,          // Atualiza a cada 5 minutos
    placeholderData: (previousData) => previousData, // Mantém dados anteriores durante refetch
    retry: 1,
  });
}