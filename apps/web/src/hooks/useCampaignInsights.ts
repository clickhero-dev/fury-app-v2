import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

/** Intervalo de datas disponível para consulta de insights de campanha. */
export type InsightsDateRange = 'last_7d' | 'last_30d' | 'last_90d';

/** Métricas diárias de uma campanha para composição de gráficos de série temporal. */
export interface DailyInsight {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  conversions: number;
}

/** Criativo de anúncio com preview visual. */
export interface CampaignCreative {
  id: string;
  name: string;
  status: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  videoId?: string;
  headline?: string;
  primaryText?: string;
  isVideo: boolean;
}

/** Dados completos de insights de uma campanha com série temporal. */
export interface CampaignInsightsData {
  campaign: {
    id: string;
    name: string;
    status: string;
  };
  /** Histórico diário de métricas no período solicitado. */
  timeseries: DailyInsight[];
  /** Anúncios da campanha com criativos para preview visual. */
  creatives: CampaignCreative[];
}

interface ApiResponse {
  success: boolean;
  data: CampaignInsightsData;
}

/**
 * Hook para buscar insights e série temporal de métricas de uma campanha específica.
 *
 * - Só executa a query se `campaignId` estiver definido.
 * - Cache válido por 60 segundos.
 *
 * @param campaignId - ID da campanha a ser consultada
 * @param dateRange - Período de análise: últimos 7, 30 ou 90 dias
 * @returns Resultado do React Query com `CampaignInsightsData`
 *
 * @example
 * const { data, isLoading } = useCampaignInsights('uuid-da-campanha', 'last_7d');
 */
export function useCampaignInsights(campaignId: string, dateRange: InsightsDateRange) {
  return useQuery({
    queryKey: ['campaign-insights', campaignId, dateRange],
    queryFn: async (): Promise<CampaignInsightsData> => {
      const response = await api.get<ApiResponse>(`/campaigns/${campaignId}/insights`, {
        params: { date_range: dateRange },
      });
      return response.data.data;
    },
    enabled: !!campaignId, // Não executa se campaignId estiver vazio
    staleTime: 60 * 1000, // Cache válido por 60 segundos
  });
}
