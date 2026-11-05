import type {
  MetricsSummaryResponse,
  CampaignResponse,
  DailyMetricsResponse,
  CampaignInsightsResponse,
  AdsetResponse,
  GoalsProgressResponse,
  PartialFailure,
} from '../../types/metrics.types.js';

export interface IMetricsProvider {
  getSummary(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<MetricsSummaryResponse | null>;

  getCampaigns(
    tenantId: string,
    startDate: string,
    endDate: string,
    status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    page?: number,
    limit?: number,
    includeOnlyLeadForm?: boolean
  ): Promise<{
    data: CampaignResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
    partial_failures: PartialFailure[];
  }>;

  getCampaignInsights(
    tenantId: string,
    campaignId: string,
    startDate: string,
    endDate: string
  ): Promise<CampaignInsightsResponse>;

  getCampaignAdsets(tenantId: string, campaignId: string): Promise<AdsetResponse[]>;

  getDailyMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]>;

  getGoalsProgress(tenantId: string): Promise<GoalsProgressResponse>;
}
