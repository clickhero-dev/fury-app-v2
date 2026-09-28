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
  degraded?: boolean;
  firstSyncPending?: boolean;
  syncedAt?: string | null;
  subscriptionError?: { code: string; message: string };
  partialFailures?: Array<{ item_id?: string; provider: string; code?: string; reason: string }>;
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
        const response = await api.get<CampaignsApiResponse & { degraded?: boolean; firstSyncPending?: boolean; syncedAt?: string | null; partial_failures?: CampaignsResult['partialFailures'] }>('/v2/campaigns', {
          params: { limit: 100, startDate, endDate },
        });
        const items = normalizeCampaignItems(response.data?.data);
        // ADR-0002: falha parcial de integração vem em `data.partial_failures`
        // (nunca derruba a lista nem vira "nenhuma campanha" sem motivo).
        const raw = (response.data?.data ?? {}) as { partial_failures?: Array<{ item_id?: string; provider: string; code?: string; reason: string }> };
        return {
          data: items.length === 0 ? [] : items.map(mapCampaignApiToRow),
          partialFailures: Array.isArray(response.data?.partial_failures)
            ? response.data.partial_failures
            : Array.isArray(raw.partial_failures) ? raw.partial_failures : [],
          degraded: response.data?.degraded ?? false,
          firstSyncPending: response.data?.firstSyncPending ?? false,
          syncedAt: response.data?.syncedAt ?? null,
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
    refetchInterval: (query) => query.state.data?.degraded ? 30_000 : false,
  });
}
