import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export type InsightsDateRange = 'last_7d' | 'last_30d' | 'last_90d';

export interface DailyInsight {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  conversions: number;
}

export interface CampaignInsightsData {
  campaign: {
    id: string;
    name: string;
    status: string;
  };
  timeseries: DailyInsight[];
}

interface ApiResponse {
  success: boolean;
  data: CampaignInsightsData;
}

export function useCampaignInsights(campaignId: string, dateRange: InsightsDateRange) {
  return useQuery({
    queryKey: ['campaign-insights', campaignId, dateRange],
    queryFn: async (): Promise<CampaignInsightsData> => {
      const response = await api.get<ApiResponse>(`/campaigns/${campaignId}/insights`, {
        params: { date_range: dateRange },
      });
      return response.data.data;
    },
    enabled: !!campaignId,
    staleTime: 60 * 1000,
  });
}
