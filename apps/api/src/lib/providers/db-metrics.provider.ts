import { IMetricsProvider } from './metrics.provider';
import {
  MetricsSummaryResponse,
  CampaignResponse,
  DailyMetricsResponse,
} from '../types/metrics.types';

export class DatabaseMetricsProvider implements IMetricsProvider {
  async getSummary(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<MetricsSummaryResponse | null> {
    return null;
  }

  async getCampaigns(
    tenantId: string,
    startDate: string,
    endDate: string,
    status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    page: number = 1,
    limit: number = 10
  ): Promise<{
    data: CampaignResponse[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return {
      data: [],
      total: 0,
      page,
      pageSize: limit,
    };
  }

  async getCampaignInsights(
    tenantId: string,
    campaignId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    campaign: { id: string; name: string; status: string } | null;
    summary: MetricsSummaryResponse | null;
    daily: DailyMetricsResponse[];
  }> {
    return {
      campaign: null,
      summary: null,
      daily: [],
    };
  }

  async getDailyMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]> {
    return [];
  }
}
