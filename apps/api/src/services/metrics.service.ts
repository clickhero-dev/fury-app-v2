import { IMetricsProvider } from '../lib/providers/metrics.provider.js';
import type {
  MetricsSummaryResponse,
  CampaignResponse,
  DailyMetricsResponse,
  PaginatedResponse,
  CampaignInsightsResponse,
  AdsetResponse,
  GoalsProgressResponse,
} from '../types/metrics.types.js';

export class MetricsService {
  constructor(private provider: IMetricsProvider) {}

  private getDefaultDateRange(): { startDate: string; endDate: string } {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  }

  async getSummary(
    tenantId: string,
    startDate?: string,
    endDate?: string
  ): Promise<MetricsSummaryResponse | null> {
    const { startDate: defaultStart, endDate: defaultEnd } =
      this.getDefaultDateRange();

    const finalStartDate = startDate || defaultStart;
    const finalEndDate = endDate || defaultEnd;

    return this.provider.getSummary(tenantId, finalStartDate, finalEndDate);
  }

  async getCampaigns(
    tenantId: string,
    startDate?: string,
    endDate?: string,
    status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedResponse<CampaignResponse>> {
    const { startDate: defaultStart, endDate: defaultEnd } =
      this.getDefaultDateRange();

    const finalStartDate = startDate || defaultStart;
    const finalEndDate = endDate || defaultEnd;

    const result = await this.provider.getCampaigns(
      tenantId,
      finalStartDate,
      finalEndDate,
      status,
      page,
      limit
    );

    return {
      data: result.data,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    };
  }

  async getCampaignInsights(
    tenantId: string,
    campaignId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CampaignInsightsResponse> {
    const { startDate: defaultStart, endDate: defaultEnd } =
      this.getDefaultDateRange();

    const finalStartDate = startDate || defaultStart;
    const finalEndDate = endDate || defaultEnd;

    return this.provider.getCampaignInsights(
      tenantId,
      campaignId,
      finalStartDate,
      finalEndDate
    );
  }

  async getCampaignAdsets(
    tenantId: string,
    campaignId: string
  ): Promise<AdsetResponse[]> {
    return this.provider.getCampaignAdsets(tenantId, campaignId);
  }

  async getDailyMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]> {
    return this.provider.getDailyMetrics(tenantId, startDate, endDate);
  }

  async getGoalsProgress(tenantId: string): Promise<GoalsProgressResponse> {
    return this.provider.getGoalsProgress(tenantId);
  }
}
