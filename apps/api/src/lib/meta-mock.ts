import { CampaignMetricsDB, DailyMetricsDB } from '../types/metrics.types.js';

function generateMockDailyData(): DailyMetricsDB[] {
  const daily: DailyMetricsDB[] = [];
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const conversions = i % 3 === 0 ? 4 : 3;

    daily.push({
      date: dateStr,
      spend: 1620,
      impressions: 4840,
      clicks: 128,
      conversions,
      roas: 3.2,
    });
  }

  return daily;
}

const mockDailyData = generateMockDailyData();

export const mockMetrics = {
  summary: {
    spend: 485000,
    impressions: 145200,
    clicks: 3840,
    ctr: 2.64,
    cpm: 3340,
    cpa: 4850,
    roas: 3.2,
    conversions: 100,
  },
  campaigns: [
    {
      campaignId: 'camp_001',
      name: 'Campanha Black Friday',
      status: 'ACTIVE' as const,
      daily: mockDailyData.map(d => ({
        ...d,
        spend: Math.round(d.spend * 0.43),
        impressions: Math.round(d.impressions * 0.468),
        clicks: Math.round(d.clicks * 0.473),
        conversions: Math.round(d.conversions * 0.50),
      })),
    },
    {
      campaignId: 'camp_002',
      name: 'Retargeting Carrinho',
      status: 'ACTIVE' as const,
      daily: mockDailyData.map(d => ({
        ...d,
        spend: Math.round(d.spend * 0.20),
        impressions: Math.round(d.impressions * 0.152),
        clicks: Math.round(d.clicks * 0.193),
        conversions: Math.round(d.conversions * 0.30),
      })),
    },
    {
      campaignId: 'camp_003',
      name: 'Prospecção Fria',
      status: 'PAUSED' as const,
      daily: mockDailyData.map(d => ({
        ...d,
        spend: Math.round(d.spend * 0.37),
        impressions: Math.round(d.impressions * 0.380),
        clicks: Math.round(d.clicks * 0.334),
        conversions: Math.round(d.conversions * 0.20),
      })),
    },
  ] as CampaignMetricsDB[],
  daily: mockDailyData,
};
