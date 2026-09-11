import { keepPreviousData, useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { getSaoPauloYMD, formatYMD } from '../lib/date-sao-paulo';
import {
  mapCampaignApiToRow,
  type CampaignApiItem,
  type CampaignData,
  type CampaignsApiResponse,
} from '../types/campaigns';

interface CampaignsResult {
  data: CampaignData[];
  subscriptionError?: { code: string; message: string };
}

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
    queryFn: async (): Promise<CampaignsResult> => {
      try {
        const response = await api.get<CampaignsApiResponse>('/metrics/campaigns', {
          params: { limit: 100, startDate, endDate },
        });
        const items = normalizeCampaignItems(response.data?.data);
        return {
          data: items.length === 0 ? [] : items.map(mapCampaignApiToRow),
        };
      } catch (error: any) {
        if (error?.response?.status === 403 && error?.response?.data?.error?.code === 'SUBSCRIPTION_EXPIRED') {
          return {
            data: [],
            subscriptionError: {
              code: error?.response?.data?.error?.code,
              message: error?.response?.data?.error?.message,
            },
          };
        }
        throw error;
      }
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}