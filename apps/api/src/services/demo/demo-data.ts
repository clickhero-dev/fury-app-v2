/**
 * Dados exclusivamente de apresentação. Eles nunca são persistidos e só podem
 * ser retornados por requests autenticadas com `role === 'demo'`.
 */
export const DEMO_CAMPAIGNS = [
  { id: 'demo-camp-escala', name: 'Coleção Primavera — Escala', status: 'ACTIVE', objective: 'OUTCOME_SALES', budget: { daily: 450 }, spend: 8420, impressions: 186400, clicks: 6840, conversions: 362, ctr: 3.67, cpc: 1.23, cpm: 45.17, roas: 5.18, cpa: 23.26, hasLeadForm: false },
  { id: 'demo-camp-leads', name: 'Captação Premium — WhatsApp', status: 'ACTIVE', objective: 'OUTCOME_LEADS', budget: { daily: 320 }, spend: 5160, impressions: 121800, clicks: 4290, conversions: 248, ctr: 3.52, cpc: 1.2, cpm: 42.36, roas: 4.46, cpa: 20.81, hasLeadForm: true },
  { id: 'demo-camp-retargeting', name: 'Remarketing Clientes VIP', status: 'PAUSED', objective: 'OUTCOME_SALES', budget: { daily: 180 }, spend: 2340, impressions: 50800, clicks: 1760, conversions: 104, ctr: 3.46, cpc: 1.33, cpm: 46.06, roas: 4.82, cpa: 22.5, hasLeadForm: false },
] as const;

const DEMO_LEADS = [
  { id: 'demo-lead-ana', name: 'Ana Martins', email: 'ana.martins@exemplo.test', phone: '+55 11 99999-0101', createdAt: '2026-10-06T13:30:00.000Z', status: 'negociando', campaignId: 'demo-camp-leads', campaignName: 'Captação Premium — WhatsApp' },
  { id: 'demo-lead-bruno', name: 'Bruno Lima', email: 'bruno.lima@exemplo.test', phone: '+55 11 99999-0102', createdAt: '2026-10-05T15:10:00.000Z', status: 'novo', campaignId: 'demo-camp-leads', campaignName: 'Captação Premium — WhatsApp' },
] as const;

function rangeDates(startDate?: string, endDate?: string): string[] {
  const end = endDate ? new Date(`${endDate}T00:00:00.000Z`) : new Date();
  const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : new Date(end.getTime() - 6 * 86400000);
  const days = Math.max(1, Math.min(90, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1));
  return Array.from({ length: days }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
}

export function demoCampaigns(status?: string) {
  const items = status ? DEMO_CAMPAIGNS.filter((campaign) => campaign.status === status.toUpperCase()) : DEMO_CAMPAIGNS;
  return items.map((campaign) => ({ ...campaign, metrics: { ...campaign } }));
}

export function demoCampaign(id: string) {
  const campaign = DEMO_CAMPAIGNS.find((item) => item.id === id);
  return campaign ? { ...campaign, metrics: { ...campaign } } : null;
}

export function demoSummary() {
  const items = DEMO_CAMPAIGNS;
  const spend = items.reduce((sum, item) => sum + item.spend, 0);
  const conversions = items.reduce((sum, item) => sum + item.conversions, 0);
  return {
    spend,
    impressions: items.reduce((sum, item) => sum + item.impressions, 0),
    clicks: items.reduce((sum, item) => sum + item.clicks, 0),
    conversions,
    roas: Number((items.reduce((sum, item) => sum + item.roas * item.spend, 0) / spend).toFixed(2)),
    cpa: Number((spend / conversions).toFixed(2)),
  };
}

export function demoDaily(startDate?: string, endDate?: string) {
  const totals = demoSummary();
  const dates = rangeDates(startDate, endDate);
  return dates.map((date, index) => {
    const factor = 0.84 + (index % 5) * 0.07;
    return {
      date,
      spend: Number((totals.spend / dates.length * factor).toFixed(2)),
      conversions: Math.round(totals.conversions / dates.length * factor),
      roas: Number((totals.roas + (index % 3) * 0.08).toFixed(2)),
      clicks: Math.round(totals.clicks / dates.length * factor),
      impressions: Math.round(totals.impressions / dates.length * factor),
    };
  });
}

export function demoLeads(campaignId?: string) {
  return DEMO_LEADS.filter((lead) => !campaignId || lead.campaignId === campaignId).map((lead) => ({ ...lead }));
}

export function demoGoals() {
  const summary = demoSummary();
  const goals = [
    { id: 'conversions', name: 'Conversões', metric: 'conversions', unit: '', target_value: 600, current_value: summary.conversions, progress_pct: 119, projected_value: 716, deadline: null, status: 'on_track', sparkline: [] },
    { id: 'spend', name: 'Orçamento', metric: 'spend', unit: '', target_value: 14000, current_value: summary.spend, progress_pct: 114, projected_value: 15900, deadline: null, status: 'on_track', sparkline: [] },
    { id: 'roas', name: 'ROAS', metric: 'roas', unit: '', target_value: 4, current_value: summary.roas, progress_pct: 113, projected_value: summary.roas, deadline: null, status: 'on_track', sparkline: [] },
  ];
  return { hasGoals: true, objective: 'gerar_leads', goals, primary_goal: goals[0], days_elapsed: 18, days_remaining: 12, days_in_month: 30, ideal_line: [], alerts: [] };
}

export const demoInstagramInsights = { comments: 486, saves: 1294, followers: 738 };

/** Identidade somente visual para telas que verificam se a conta Meta foi conectada. */
export const demoMetaConnection = {
  id: 'demo-meta-connection',
  selectedAdAccountId: 'act_demo_001',
  selectedInstagramUsername: 'fury.demo',
};
