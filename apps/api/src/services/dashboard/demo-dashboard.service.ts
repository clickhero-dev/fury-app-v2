import { DemoDashboardRepository } from '../../repository/demo-dashboard.repository.js';

export const DEMO_TENANT_SLUG = 'fashion-demo';

export const CREATIVE_FATIGUE_THRESHOLDS = {
  frequency: 4,
  ctrDropPercent: 25,
  cpaIncreasePercent: 25,
} as const;

export interface DemoDashboardData {
  demo: true;
  summary: { spend: number; roas: number; cpa: number; conversions: number };
  goals: { objective: string; targetConversions: number; projectedConversions: number };
  daily: Array<{ date: string; spend: number; conversions: number; roas: number; clicks: number; impressions: number }>;
  campaigns: Array<{ id: string; name: string; status: string; spend: number; conversions: number; roas: number; cpa: number }>;
  instagram: { comments: number; saves: number; followers: number };
  insights: {
    bestCreatives: Array<{ id: string; name: string; conversions: number; customers: number; periodLabel: string }>;
    topPosts: Array<{ id: string; title: string; engagement: number; likes: number; comments: number; saves: number; periodLabel: string }>;
    tiredCreatives: Array<{ id: string; name: string; reason: string; frequency: number; ctrDropPercent: number; cpaIncreasePercent: number }>;
  };
}

const DEMO_DASHBOARD: DemoDashboardData = {
  demo: true,
  summary: { spend: 8420, roas: 4.8, cpa: 28.26, conversions: 298 },
  goals: { objective: 'aumentar_vendas', targetConversions: 360, projectedConversions: 382 },
  daily: [
    { date: '2026-11-01', spend: 1030, conversions: 35, roas: 4.4, clicks: 494, impressions: 13800 },
    { date: '2026-11-02', spend: 1110, conversions: 39, roas: 4.6, clicks: 538, impressions: 14900 },
    { date: '2026-11-03', spend: 1190, conversions: 44, roas: 4.9, clicks: 586, impressions: 15700 },
    { date: '2026-11-04', spend: 1140, conversions: 42, roas: 4.7, clicks: 554, impressions: 15100 },
    { date: '2026-11-05', spend: 1290, conversions: 47, roas: 5.1, clicks: 628, impressions: 16600 },
    { date: '2026-11-06', spend: 1320, conversions: 46, roas: 4.8, clicks: 641, impressions: 17100 },
    { date: '2026-11-07', spend: 1340, conversions: 45, roas: 5.0, clicks: 650, impressions: 17300 },
  ],
  campaigns: [
    { id: 'demo-retargeting', name: 'Retargeting coleção Primavera', status: 'ACTIVE', spend: 2470, conversions: 103, roas: 6.2, cpa: 23.98 },
    { id: 'demo-lookalike', name: 'Novas clientes · Lookalike', status: 'ACTIVE', spend: 3110, conversions: 111, roas: 4.5, cpa: 28.02 },
    { id: 'demo-video', name: 'Vídeo coleção cápsula', status: 'ACTIVE', spend: 2840, conversions: 84, roas: 3.7, cpa: 33.81 },
  ],
  instagram: { comments: 428, saves: 916, followers: 284 },
  insights: {
    bestCreatives: [
      { id: 'creative-look-aurora', name: 'Look Aurora · vídeo', conversions: 74, customers: 61, periodLabel: 'No período selecionado' },
      { id: 'creative-capsule', name: 'Coleção cápsula · carrossel', conversions: 58, customers: 49, periodLabel: 'No período selecionado' },
      { id: 'creative-freight', name: 'Frete grátis · imagem', conversions: 43, customers: 36, periodLabel: 'No período selecionado' },
    ],
    topPosts: [
      { id: 'post-editorial', title: 'Editorial Primavera', engagement: 1840, likes: 1120, comments: 186, saves: 534, periodLabel: 'No período selecionado' },
      { id: 'post-bastidores', title: 'Bastidores da coleção', engagement: 1370, likes: 842, comments: 142, saves: 386, periodLabel: 'No período selecionado' },
      { id: 'post-guia', title: 'Guia de combinações', engagement: 1125, likes: 613, comments: 100, saves: 412, periodLabel: 'No período selecionado' },
    ],
    tiredCreatives: [
      { id: 'creative-sale', name: 'Liquidação · imagem estática', reason: 'Frequência alta (4,8). Renove este anúncio.', frequency: 4.8, ctrDropPercent: 12, cpaIncreasePercent: 14 },
      { id: 'creative-black', name: 'Black Friday · carrossel', reason: 'CTR caiu 31% e CPA subiu 28%.', frequency: 3.2, ctrDropPercent: 31, cpaIncreasePercent: 28 },
    ],
  },
};

export class DemoDashboardService {
  constructor(private readonly repoFactory: (tenantId: string) => DemoDashboardRepository) {}

  async getForTenant(tenantId: string): Promise<{ demo: false } | DemoDashboardData> {
    const tenant = await this.repoFactory(tenantId).findTenant();
    return tenant?.isDemo === true ? DEMO_DASHBOARD : { demo: false };
  }

  async campaignDataForTenant(tenantId: string) {
    const data = await this.getForTenant(tenantId);
    if (!data.demo) return null;
    const campaigns = data.campaigns.map((campaign) => ({
      ...campaign,
      objective: 'OUTCOME_SALES', budget: { daily: 1200 }, hasLeadForm: false,
      impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0,
      metrics: { spend: campaign.spend, conversions: campaign.conversions, roas: campaign.roas, cpa: campaign.cpa },
      lastInsightsAt: null,
    }));
    return { ...data, campaigns };
  }
}
