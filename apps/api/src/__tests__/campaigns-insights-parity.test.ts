import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { MetricsDailyRepository } from '../repository/metrics-daily.repository.js';
import { MetricsService } from '../services/campaigns/metrics.service.js';
import type { MetaInsightsData } from '../lib/meta-api.js';

/**
 * T6 — Insights de campanha servidos do rollup (feature 014).
 * Caminho: CampaignsService.getCampaignInsights → provider (T5) → rollup.
 * timeseries 7/30/90d idêntica ao cálculo live; campaign/creatives mantêm live.
 */
const sql = postgres(
  process.env.TEST_DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_test',
  { max: 1, prepare: false }
);

const tenantId = randomUUID();
const syncRepo = new MetricsDailyRepository(tenantId);

function insightRow(over: Partial<Record<string, any>> = {}): MetaInsightsData {
  return {
    campaign_id: 'camp_ts',
    campaign_name: 'Timeseries',
    date_start: '2026-09-01',
    date_stop: '2026-09-01',
    spend: '30.00',
    impressions: '3000',
    clicks: '120',
    ctr: '4.0',
    cpm: '10.00',
    cpc: '0.25',
    actions: [{ action_type: 'link_click', value: '100' }],
    purchase_roas: [{ action_type: 'omni_purchase', value: '2.0' }],
    cost_per_action_type: [{ action_type: 'purchase', value: '0.3' }],
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

// Fronteiras Meta mockadas (o provider T5 não deve precisar delas p/ timeseries)
import { MetaRepository } from '../repository/meta.repository.js';
import * as cryptoUtils from '../utils/crypto.js';
import * as metaApi from '../lib/meta-api.js';
vi.spyOn(cryptoUtils, 'decryptMetaToken').mockImplementation(() => 'decrypted-token');
vi.spyOn(MetaRepository.prototype, 'findLatestMetaConnection').mockResolvedValue({
  accessToken: 'tok',
  adAccounts: [{ id: 'act_1', account_status: 1 }],
  selectedAdAccountId: 'act_1',
} as any);
const insightsSpy = vi
  .spyOn(metaApi, 'getMetaInsights')
  .mockImplementation(async () => ({ data: [] } as any));
vi.spyOn(metaApi, 'metaApiCall').mockImplementation(async () => ({ data: [] } as any));

// Provider real (caminho T5) + service real de métricas
import { DatabaseMetricsProvider } from '../lib/providers/db-metrics.provider.js';
const provider = new DatabaseMetricsProvider();
const metricsService = new MetricsService(provider);

const campaignMetaId = 'camp_ts';

beforeEach(async () => {
  await sql`DELETE FROM metrics_daily WHERE tenant_id = ${tenantId}`;
  metaInsightsSpyReset();
});

function metaInsightsSpyReset() {
  insightsSpy.mockClear();
  insightsSpy.mockImplementation(async () => ({ data: [] } as any));
}

afterAll(async () => {
  vi.restoreAllMocks();
  await sql`DELETE FROM metrics_daily WHERE tenant_id = ${tenantId}`;
  await sql.end();
});

describe('insights de campanha do rollup', () => {
  it('provider.getCampaignInsights: daily do rollup (timeIncrement=1), 0 Meta', async () => {
    await populateRollup([
      insightRow({ date_start: '2026-09-01', date_stop: '2026-09-01' }),
      insightRow({ date_start: '2026-09-02', date_stop: '2026-09-02', spend: '45.00', clicks: '150', actions: [{ action_type: 'link_click', value: '140' }] }),
      insightRow({ date_start: '2026-09-03', date_stop: '2026-09-03', spend: '25.00', clicks: '80', actions: [{ action_type: 'link_click', value: '75' }] }),
    ]);

    const res = await provider.getCampaignInsights(tenantId, campaignMetaId, '2026-09-01', '2026-09-03');

    expect(res.daily).toHaveLength(3);
    expect(Number(res.daily[0]!.spend)).toBeCloseTo(30, 2);
    expect(Number(res.daily[1]!.spend)).toBeCloseTo(45, 2);
    expect(res.daily[0]!.conversions).toBeGreaterThan(0);
    // timeseries não chama Meta (rollup cobre)
    expect(insightsSpy).not.toHaveBeenCalled();

    // fix QA #173: ctr/cpm REAIS no summary de campanha (antes fixos em 0)
    expect(res.summary).not.toBeNull();
    expect(res.summary!.ctr).toBeGreaterThan(0);
    expect(res.summary!.cpm).toBeGreaterThan(0);
    expect(res.summary!.impressions).toBe(3000 + 3000 + 3000);
    expect(res.summary!.clicks).toBe(120 + 150 + 80);
  });

  it('série >30 dias é truncada p/ últimos 30 (capDailySeries mantido)', async () => {
    const rows: MetaInsightsData[] = [];
    const start = new Date('2026-08-01T00:00:00Z');
    for (let i = 0; i < 35; i++) {
      const day = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      rows.push(insightRow({ date_start: day, date_stop: day, spend: '10.00' }));
    }
    await populateRollup(rows);

    const res = await provider.getCampaignInsights(tenantId, campaignMetaId, '2026-08-01', '2026-09-04');
    expect(res.daily.length).toBeLessThanOrEqual(30);
    // últimos 30 dias de 35 → começa no 6º dia
    expect(res.daily[0]!.date).toBe('2026-08-06');
  });

  it('campanha sem dados → daily vazio, sem erro, sem Meta', async () => {
    const res = await provider.getCampaignInsights(tenantId, 'camp_inexistente', '2026-09-01', '2026-09-03');
    expect(res.daily).toHaveLength(0);
    expect(res.summary).toBeNull();
  });

  it('lacuna de cobertura → on-demand alimenta rollup e responde', async () => {
    insightsSpy.mockImplementation(async (params: any) => ({
      data: [insightRow({ date_start: '2026-07-15', date_stop: '2026-07-15', spend: '12.00' })],
    }) as any);

    const res = await provider.getCampaignInsights(tenantId, campaignMetaId, '2026-07-01', '2026-07-31');
    expect(res.daily).toHaveLength(1);
    expect(Number(res.daily[0]!.spend)).toBeCloseTo(12, 2);

    // persistido
    const cov = await syncRepo.getCoverage();
    expect(cov.minDate).toBe('2026-07-15');
  });
});
