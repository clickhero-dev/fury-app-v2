import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { campanhasMock } from '../lib/campanhas-mock';
import { getSaoPauloYMD, formatYMD } from '../lib/date-sao-paulo';
import {
  mapCampaignApiToRow,
  type CampaignApiItem,
  type CampaignData,
  type CampaignsApiResponse,
} from '../types/campaigns';

/**
 * Normaliza a resposta da API de campanhas para sempre retornar um array.
 * A API pode retornar diretamente um array ou um objeto `{ campaigns: [] }`.
 *
 * @param data - Dados brutos retornados pela API
 * @returns Array de itens de campanha normalizado
 */
function normalizeCampaignItems(data: unknown): CampaignApiItem[] {
  if (Array.isArray(data)) {
    return data as CampaignApiItem[];
  }
  if (data && typeof data === 'object' && Array.isArray((data as { campaigns?: unknown }).campaigns)) {
    return (data as { campaigns: CampaignApiItem[] }).campaigns;
  }
  return [];
}

/**
 * Calcula o intervalo "este mês": do primeiro dia do mês atual até hoje,
 * no horário de Brasília. Mesmo cálculo usado no Dashboard.
 *
 * @returns Objeto com `startDate` e `endDate` no formato YYYY-MM-DD
 */
function getThisMonthRange(): { startDate: string; endDate: string } {
  const now = getSaoPauloYMD();
  return { startDate: formatYMD({ ...now, day: 1 }), endDate: formatYMD(now) };
}

/** Período customizado para filtrar campanhas por data. */
export interface CampaignsPeriod {
  startDate: string;
  endDate: string;
}

/**
 * Hook para buscar e listar campanhas com métricas do período informado.
 *
 * - Atualiza automaticamente a cada 30 segundos.
 * - Em caso de erro na API, retorna dados mock como fallback.
 * - Se nenhum período for informado, usa o mês atual (horário de Brasília).
 *
 * @param period - Período opcional para filtrar campanhas. Se omitido, usa o mês atual.
 * @returns Resultado do React Query com array de `CampaignData`
 *
 * @example
 * const { data: campaigns, isLoading } = useCampaigns();
 *
 * @example
 * // Com período customizado
 * const { data } = useCampaigns({ startDate: '2026-06-01', endDate: '2026-06-30' });
 */
export function useCampaigns(period?: CampaignsPeriod) {
  const { startDate, endDate } = period ?? getThisMonthRange();

  return useQuery({
    queryKey: ['campaigns', startDate, endDate],
    queryFn: async (): Promise<CampaignData[]> => {
      try {
        const response = await api.get<CampaignsApiResponse>('/metrics/campaigns', {
          params: { limit: 100, startDate, endDate },
        });
        const items = normalizeCampaignItems(response.data?.data);
        if (items.length === 0) return [];
        return items.map(mapCampaignApiToRow);
      } catch (error) {
        console.warn('Failed to fetch campaigns, using mock data:', error);
        return campanhasMock;
      }
    },
    staleTime: 30 * 1000,      // Cache válido por 30 segundos
    refetchInterval: 30 * 1000, // Refetch automático a cada 30 segundos
  });
}