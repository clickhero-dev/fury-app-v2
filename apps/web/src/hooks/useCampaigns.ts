import { keepPreviousData, useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { getSaoPauloYMD, formatYMD } from '../lib/date-sao-paulo';
import {
  mapCampaignApiToRow,
  type CampaignApiItem,
  type CampaignData,
  type CampaignsApiResponse,
} from '../types/campaigns';

function normalizeCampaignItems(data: unknown): CampaignApiItem[] {
  if (Array.isArray(data)) {
    return data as CampaignApiItem[];
  }
  if (data && typeof data === 'object' && Array.isArray((data as { campaigns?: unknown }).campaigns)) {
    return (data as { campaigns: CampaignApiItem[] }).campaigns;
  }
  return [];
}

function getThisMonthRange(): { startDate: string; endDate: string } {
  const now = getSaoPauloYMD();
  return { startDate: formatYMD({ ...now, day: 1 }), endDate: formatYMD(now) };
}

export interface CampaignsPeriod {
  startDate: string;
  endDate: string;
}

export function useCampaigns(period?: CampaignsPeriod) {
  const { startDate, endDate } = period ?? getThisMonthRange();

  return useQuery({
    queryKey: ['campaigns', startDate, endDate],
    queryFn: async (): Promise<CampaignData[]> => {
      const response = await api.get<CampaignsApiResponse>('/metrics/campaigns', {
        params: { limit: 100, startDate, endDate },
      });
      const items = normalizeCampaignItems(response.data?.data);
      if (items.length === 0) return [];
      return items.map(mapCampaignApiToRow);
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}