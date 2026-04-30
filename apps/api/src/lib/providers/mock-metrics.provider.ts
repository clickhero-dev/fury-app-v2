import { IMetricsProvider } from './metrics.provider.js';
import { mockMetrics } from '../meta-mock.js';
import type {
  MetricsSummaryResponse,
  CampaignResponse,
  DailyMetricsResponse,
} from '../../types/metrics.types';
import {
  centavosToReais,
  calculateCTR,
  calculateCPA,
  calculateCPM,
  aggregateDailyMetrics,
} from '../../utils/metrics-formatter';

export class MockMetricsProvider implements IMetricsProvider {
  async getSummary(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<MetricsSummaryResponse | null> {
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const filteredDaily = mockMetrics.daily.filter(d => {
      const d_date = new Date(d.date);
      return d_date >= startDateObj && d_date <= endDateObj;
    });

    if (filteredDaily.length === 0) {
      return null;
    }

    const aggregated = aggregateDailyMetrics(filteredDaily);

    return {
      spend: centavosToReais(aggregated.totalSpend),
      impressions: aggregated.totalImpressions,
      clicks: aggregated.totalClicks,
      ctr: calculateCTR(aggregated.totalClicks, aggregated.totalImpressions),
      cpm: calculateCPM(aggregated.totalSpend, aggregated.totalImpressions),
      cpa: calculateCPA(
        centavosToReais(aggregated.totalSpend),
        aggregated.totalConversions
      ),
      roas: aggregated.avgRoas,
      conversions: aggregated.totalConversions,
    };
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
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    let filtered = mockMetrics.campaigns;

    if (status) {
      filtered = filtered.filter(c => c.status === status);
    }

    const campaigns: CampaignResponse[] = filtered.map(campaign => {
      const dailyInRange = campaign.daily.filter(d => {
        const d_date = new Date(d.date);
        return d_date >= startDateObj && d_date <= endDateObj;
      });

      const aggregated = aggregateDailyMetrics(dailyInRange);

      return {
        id: campaign.campaignId,
        name: campaign.name,
        status: campaign.status,
        spend: centavosToReais(aggregated.totalSpend),
        roas: aggregated.avgRoas,
        cpa: calculateCPA(
          centavosToReais(aggregated.totalSpend),
          aggregated.totalConversions
        ),
        impressions: aggregated.totalImpressions,
        clicks: aggregated.totalClicks,
      };
    });

    campaigns.sort((a, b) => b.spend - a.spend);

    const total = campaigns.length;
    const start = (page - 1) * limit;
    const paginated = campaigns.slice(start, start + limit);

    return {
      data: paginated,
      total,
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
    const campaign = mockMetrics.campaigns.find(c => c.campaignId === campaignId);

    if (!campaign) {
      return {
        campaign: null,
        summary: null,
        daily: [],
      };
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const filteredDaily = campaign.daily.filter(d => {
      const d_date = new Date(d.date);
      return d_date >= startDateObj && d_date <= endDateObj;
    });

    let summary: MetricsSummaryResponse | null = null;
    if (filteredDaily.length > 0) {
      const aggregated = aggregateDailyMetrics(filteredDaily);
      summary = {
        spend: centavosToReais(aggregated.totalSpend),
        impressions: aggregated.totalImpressions,
        clicks: aggregated.totalClicks,
        ctr: calculateCTR(aggregated.totalClicks, aggregated.totalImpressions),
        cpm: calculateCPM(aggregated.totalSpend, aggregated.totalImpressions),
        cpa: calculateCPA(
          centavosToReais(aggregated.totalSpend),
          aggregated.totalConversions
        ),
        roas: aggregated.avgRoas,
        conversions: aggregated.totalConversions,
      };
    }

    const daily: DailyMetricsResponse[] = filteredDaily.map(d => ({
      date: d.date,
      spend: centavosToReais(d.spend),
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      roas: d.roas,
    }));

    return {
      campaign: {
        id: campaign.campaignId,
        name: campaign.name,
        status: campaign.status,
      },
      summary,
      daily,
    };
  }

  async getDailyMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]> {
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const filtered = mockMetrics.daily.filter(d => {
      const d_date = new Date(d.date);
      return d_date >= startDateObj && d_date <= endDateObj;
    });

    return filtered.map(d => ({
      date: d.date,
      spend: centavosToReais(d.spend),
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      roas: d.roas,
    }));
  }
}
