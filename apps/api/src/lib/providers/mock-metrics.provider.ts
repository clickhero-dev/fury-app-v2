import { IMetricsProvider } from './metrics.provider.js';
import { mockMetrics } from '../meta-mock.js';
import type {
  MetricsSummaryResponse,
  CampaignResponse,
  DailyMetricsResponse,
  CampaignInsightsResponse,
  AdsetResponse,
  GoalsProgressResponse,
} from '../../types/metrics.types.js';
import {
  centavosToReais,
  roundToDecimals,
  calculateCTR,
  calculateCPA,
  calculateCPM,
  aggregateDailyMetrics,
} from '../../utils/metrics-formatter.js';

export class MockMetricsProvider implements IMetricsProvider {
  private parseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  async getSummary(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<MetricsSummaryResponse | null> {
    const campaigns = await this.getCampaigns(tenantId, startDate, endDate, undefined, 1, 100);

    if (campaigns.data.length === 0) {
      return null;
    }

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRoas = 0;

    for (const campaign of campaigns.data) {
      totalSpend += campaign.metrics.spend;
      totalImpressions += campaign.metrics.impressions;
      totalClicks += campaign.metrics.clicks;
      totalConversions += (campaign.metrics.conversions ?? 0);
      totalRoas += (campaign.metrics.roas ?? 0);
    }

    const avgRoas = campaigns.data.length > 0 ? roundToDecimals(totalRoas / campaigns.data.length, 2) : 0;

    return {
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      conversions: totalConversions,
      ctr: calculateCTR(totalClicks, totalImpressions),
      cpm: calculateCPM(totalSpend * 100, totalImpressions),
      cpa: calculateCPA(totalSpend, totalConversions),
      roas: avgRoas,
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
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  }> {
    let filtered = mockMetrics.campaigns;

    if (status) {
      filtered = filtered.filter(c => c.status === status);
    }

    const startDateObj = this.parseDate(startDate);
    const endDateObj = this.parseDate(endDate);

    const campaigns: CampaignResponse[] = filtered.map(campaign => {
      const dailyInRange = campaign.daily.filter(d => {
        const d_date = this.parseDate(d.date);
        return d_date >= startDateObj && d_date <= endDateObj;
      });

      const aggregated = aggregateDailyMetrics(dailyInRange);

      const spend = roundToDecimals(centavosToReais(aggregated.totalSpend), 2);
      return {
        id: campaign.campaignId,
        name: campaign.name,
        status: campaign.status,
        metrics: {
          spend,
          clicks: aggregated.totalClicks,
          impressions: aggregated.totalImpressions,
          conversions: aggregated.totalConversions,
          roas: aggregated.avgRoas,
          cpa:
            aggregated.totalConversions > 0
              ? calculateCPA(spend, aggregated.totalConversions)
              : null,
        },
      };
    });

    campaigns.sort((a, b) => b.metrics.spend - a.metrics.spend);

    const total = campaigns.length;
    const start = (page - 1) * limit;
    const paginated = campaigns.slice(start, start + limit);

    return {
      data: paginated,
      pagination: {
        page,
        limit,
        total,
      },
    };
  }

  async getCampaignInsights(
    tenantId: string,
    campaignId: string,
    startDate: string,
    endDate: string
  ): Promise<CampaignInsightsResponse> {
    const campaign = mockMetrics.campaigns.find(c => c.campaignId === campaignId);

    if (!campaign) {
      return {
        campaign: null,
        summary: null,
        daily: [],
        creatives: [],
      };
    }

    const startDateObj = this.parseDate(startDate);
    const endDateObj = this.parseDate(endDate);

    const filteredDaily = campaign.daily.filter(d => {
      const d_date = this.parseDate(d.date);
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

    const sorted = [...filteredDaily].sort((a, b) => a.date.localeCompare(b.date));
    const capped = sorted.length <= 30 ? sorted : sorted.slice(-30);

    const daily: DailyMetricsResponse[] = capped.map(d => ({
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
        objective: 'OUTCOME_SALES',
      },
      summary,
      daily,
      creatives: [],
    };
  }

  async getCampaignAdsets(_tenantId: string, _campaignId: string): Promise<AdsetResponse[]> {
    return [
      {
        id: 'mock_adset_1',
        name: 'Conjunto mock',
        status: 'ACTIVE',
        dailyBudget: centavosToReais(50000),
        metrics: {
          spend: 120.5,
          clicks: 400,
          ctr: 2.5,
          cpm: 15.2,
        },
      },
    ];
  }

  async getDailyMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]> {
    const startDateObj = this.parseDate(startDate);
    const endDateObj = this.parseDate(endDate);

    const filtered = mockMetrics.daily.filter(d => {
      const d_date = this.parseDate(d.date);
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

  async getGoalsProgress(tenantId: string): Promise<GoalsProgressResponse> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = monthStart.toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];

    const summary = await this.getSummary(tenantId, startDate, endDate);

    if (!summary) {
      return {
        goal: {
          id: 'mock_goal',
          targetCpa: 50,
          targetRoas: null,
          monthlyBudget: 10000,
        },
        current: 0,
        progressPercent: 0,
        onTrack: false,
      };
    }

    const targetCpa = 50;
    const monthlyBudget = 10000;
    const estimatedGoalConversions = monthlyBudget / targetCpa;
    const progressPercent =
      estimatedGoalConversions > 0
        ? Math.min(
            Math.round((summary.conversions / estimatedGoalConversions) * 100),
            100
          )
        : 0;
    const onTrack = summary.cpa <= targetCpa * 1.1;

    return {
      goal: {
        id: 'mock_goal',
        targetCpa,
        targetRoas: null,
        monthlyBudget,
      },
      current: summary.conversions,
      progressPercent,
      onTrack,
    };
  }
}
