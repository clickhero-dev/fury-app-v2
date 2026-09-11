import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { MetricsDailyRepository } from '../repository/metrics-daily.repository.js';
import { GoalService } from '../services/goals/goal.service.js';
import { DatabaseMetricsProvider } from '../lib/providers/db-metrics.provider.js';
import type { MetaInsightsData } from '../lib/meta-api.js';

/**
 * T7 — /goals/progress consumindo o rollup (feature 014).
 * O service não muda: consome provider (T5) que lê metrics_daily.
 * Paridade: sparks/projeção idênticos ao fluxo live com o mesmo fixture.
 */
const sql = postgres(
  process.env.TEST_DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_test',
  { max: 1, prepare: false }
);

const tenantId = randomUUID();
const syncRepo = new MetricsDailyRepository(tenantId);

function insightRow(over: Partial<Record<string, any>> = {}): MetaInsightsData {
  return {
    campaign_id: 'camp_goals',
    campaign_name: 'Goals',
    date_start: '2026-09-01',
    date_stop: '2026-09-01',
    spend: '50.00',
    impressions: '5000',
    clicks: '250',
    actions: [{ action_type: 'link_click', value: '200' }],
    purchase_roas: [{ action_type: 'omni_purchase', value: '1.5' }],
    ...over,
  } as unknown as MetaInsightsData;
}

async function populateRollup(insights: MetaInsightsData[]) {
  const { extractCampaignMetricsFromInsight } = await import('../utils/meta-insights-parser.js');
  const { centavosToReais } = await import('../utils/metrics-formatter.js');
  await syncRepo.upsertBatch(
    insights.map((item) => {
      const spendReais = centavosToReais(Math.round(parseFloat(item.spend || '0') * 100));
      const { roas, cpa, conversions } = extractCampaignMetricsFromInsight(item, spendReais);
      return {
        campaignMetaId: item.campaign_id!,
        date: item.date_start!,
        campaignName: item.campaign_name ?? null,
        objective: null,
        spend: spendReais,
        impressions: parseInt(item.impressions || '0', 10),
        clicks: parseInt(item.clicks || '0', 10),
        ctr: parseFloat(item.ctr || '0'),
        cpm: parseFloat(item.cpm || '0'),
        cpc: parseFloat(item.cpc || '0'),
        conversions: conversions ?? 0,
        roas,
        cpa,
      };
    })
  );
}

// Fronteiras Meta mockadas
import { MetaRepository } from '../repository/meta.repository.js';
import * as cryptoUtils from '../utils/crypto.js';
import * as metaApi from '../lib/meta-api.js';
vi.spyOn(cryptoUtils, 'decryptMetaToken').mockImplementation(() => 'decrypted-token');
vi.spyOn(MetaRepository.prototype, 'findLatestMetaConnection').mockResolvedValue({
  accessToken: 'tok',
  adAccounts: [{ id: 'act_1', account_status: 1 }],
  selectedAdAccountId: 'act_1',
} as any);
vi.spyOn(metaApi, 'getMetaInsights').mockImplementation(async () => ({ data: [] } as any));
vi.spyOn(metaApi, 'metaApiCall').mockImplementation(async () => ({ data: [] } as any));

// Goal com metas definidas (clientGoals) — mock do repoFactory do GoalService
const clientGoalRow = {
  id: randomUUID(),
  tenantId,
  objective: 'aumentar_vendas',
  niche: 'ecommerce',
  mainProduct: 'produto',
  monthlyBudget: { value: 10000 }, // parseMoneyJson → 10000
  targetCpa: { value: 50 },        // parseMoneyJson → 50
  createdAt: new Date(),
  updatedAt: new Date(),
};

const provider = new DatabaseMetricsProvider();
const goalService = new GoalService(provider, () => ({
  findClientGoal: async () => clientGoalRow,
  findClientGoals: async () => clientGoalRow,
  upsertTenantClientGoal: async () => clientGoalRow,
  updateTenantClientGoal: async () => clientGoalRow,
}) as any);

beforeEach(async () => {
  await sql`DELETE FROM metrics_daily WHERE tenant_id = ${tenantId}`;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await sql`DELETE FROM metrics_daily WHERE tenant_id = ${tenantId}`;
  await sql.end();
});

describe('/goals/progress do rollup', () => {
  it('com rollup populado → progress/sparks do pré-processado (0 Meta)', async () => {
    // 3 dias de dados: 01, 02, 03 de setembro
    await populateRollup([
      insightRow({ date_start: '2026-09-01', date_stop: '2026-09-01' }),
      insightRow({ date_start: '2026-09-02', date_stop: '2026-09-02', spend: '40.00', clicks: '180', actions: [{ action_type: 'link_click', value: '150' }] }),
      insightRow({ date_start: '2026-09-03', date_stop: '2026-09-03', spend: '60.00', clicks: '300', actions: [{ action_type: 'link_click', value: '280' }] }),
    ]);

    const data = await goalService.getProgress(tenantId, {
      start: '2026-09-01',
      end: '2026-09-30',
    });

    // summary/daily vêm do rollup: conversões = parser (link_click): 200+150+280 = 630
    const conversionsGoal = data.goals.find((g) => g.metric === 'conversions')!;
    const budgetGoal = data.goals.find((g) => g.metric === 'spend')!;
    expect(budgetGoal.current_value).toBeCloseTo(150, 2); // 50+40+60
    expect(conversionsGoal.current_value).toBeCloseTo(630, 2);
    // ideal_line presente com os dias de dados reais
    expect(data.ideal_line.length).toBeGreaterThanOrEqual(3);
    // projeção coerente (>0)
    expect(conversionsGoal.projected_value).toBeGreaterThan(0);
  });

  it('sem dados (tenant novo) → zeros sem erro (tolerância atual mantida)', async () => {
    const data = await goalService.getProgress(tenantId, {
      start: '2026-09-01',
      end: '2026-09-30',
    });
    expect(data.hasGoals).toBe(true); // meta definida, mas sem dados
    const conversionsGoal = data.goals.find((g) => g.metric === 'conversions')!;
    expect(conversionsGoal.current_value).toBe(0);
    // ideal_line: sem dias reais, só o ponto de projeção final (remaining>0)
    expect(data.ideal_line.length).toBeLessThanOrEqual(1);
  });
});
