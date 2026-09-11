import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { DatabaseMetricsProvider } from '../lib/providers/db-metrics.provider.js';
import { MetricsDailyRepository } from '../repository/metrics-daily.repository.js';
import type { MetaInsightsData } from '../lib/meta-api.js';

/**
 * T5 — Endpoints /metrics/* servidos de metrics_daily (feature 014).
 * Paridade: o MESMO fixture de insights processado pelo caminho live
 * (fetchMetaInsights + normalizeInsights) e pelo caminho novo (rollup SQL)
 * deve produzir os MESMOS números.
 * Meta mockada (fronteira), DB real (fury_test).
 */
const sql = postgres(
  process.env.TEST_DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_test',
  { max: 1, prepare: false }
);

const tenantId = randomUUID();
const provider = new DatabaseMetricsProvider();

function insightRow(over: Partial<Record<string, any>> = {}): MetaInsightsData {
  return {
    campaign_id: 'camp_par_1',
    campaign_name: 'Paridade 1',
    date_start: '2026-09-01',
    date_stop: '2026-09-01',
    spend: '100.00',
    impressions: '10000',
    clicks: '450',
    ctr: '4.5',
    cpm: '10.00',
    cpc: '0.2222',
    actions: [{ action_type: 'link_click', value: '400' }],
    unique_actions: [{ action_type: 'link_click', value: '380' }],
    purchase_roas: [{ action_type: 'omni_purchase', value: '1.8' }],
    cost_per_action_type: [{ action_type: 'purchase', value: '0.25' }],
    ...over,
  } as unknown as MetaInsightsData;
}

/** Connection mock via vi.spyOn no repositório usado pelo provider. */
import { MetaRepository } from '../repository/meta.repository.js';
import * as cryptoUtils from '../utils/crypto.js';
vi.spyOn(cryptoUtils, 'decryptMetaToken').mockImplementation((p: string) => 'decrypted-token');
const connSpy = vi
  .spyOn(MetaRepository.prototype, 'findLatestMetaConnection')
  .mockResolvedValue({
    accessToken: 'tok',
    adAccounts: [{ id: 'act_1', account_status: 1 }],
    selectedAdAccountId: 'act_1',
  } as any);

/** Insights mockados por range (captura o que o provider pedir). */
const metaInsightsByCall: MetaInsightsData[] = [];
import * as metaApi from '../lib/meta-api.js';
const insightsSpy = vi.spyOn(metaApi, 'getMetaInsights').mockImplementation(async (params: any) => {
  return { data: metaInsightsByCall } as any;
});
// metaApiCall real (lista de campanhas p/ status live) — mockado p/ não bater na Meta
const metaApiCallSpy = vi
  .spyOn(metaApi, 'metaApiCall')
  .mockImplementation(async (_path: string, _token: string) => {
    return { data: metaCampaignList.rows } as any;
  });
/** Lista de campanhas p/ status live (configurável por teste). */
const metaCampaignList = { rows: [] as any[] };

const syncRepo = new MetricsDailyRepository(tenantId);

async function populateRollup(insights: MetaInsightsData[]) {
  // grava via MESMA normalização do sync (extractCampaignMetricsFromInsight)
  const { extractCampaignMetricsFromInsight } = await import('../utils/meta-insights-parser.js');
  const { centavosToReais } = await import('../utils/metrics-formatter.js');
  const rows = insights.map((item) => {
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
  });
  await syncRepo.upsertBatch(rows);
}

beforeEach(async () => {
  await sql`DELETE FROM metrics_daily WHERE tenant_id = ${tenantId}`;
  metaInsightsByCall.length = 0;
});

afterAll(async () => {
  connSpy.mockRestore();
  insightsSpy.mockRestore();
  await sql`DELETE FROM metrics_daily WHERE tenant_id = ${tenantId}`;
  await sql.end();
});

const RANGE = { startDate: '2026-09-01', endDate: '2026-09-30' };

describe('DatabaseMetricsProvider lendo do rollup (paridade)', () => {
  it('getSummary: números idênticos ao caminho live com o mesmo fixture', async () => {
    const fixtures = [
      insightRow(),
      insightRow({ campaign_id: 'camp_par_2', date_start: '2026-09-02', date_stop: '2026-09-02', spend: '50.00', clicks: '200', actions: [{ action_type: 'link_click', value: '180' }], unique_actions: [{ action_type: 'link_click', value: '170' }] }),
    ];

    // caminho live (insights mockados)
    metaInsightsByCall.push(...fixtures);
    const live = await provider.getSummary(tenantId, RANGE.startDate, RANGE.endDate);

    // caminho novo (rollup populado com o mesmo fixture, Meta vazio p/ provar leitura local)
    await populateRollup(fixtures);
    metaInsightsByCall.length = 0;
    insightsSpy.mockImplementation(async () => {
      throw new Error('META SHOULD NOT BE CALLED — rollup deve responder sem Meta');
    });
    const rolled = await provider.getSummary(tenantId, RANGE.startDate, RANGE.endDate);

    expect(rolled).not.toBeNull();
    expect(Number(rolled!.spend)).toBeCloseTo(Number(live!.spend), 2);
    expect(Number(rolled!.conversions)).toBeCloseTo(Number(live!.conversions), 2);
    expect(Number(rolled!.roas)).toBeCloseTo(Number(live!.roas), 1);
    expect(Number(rolled!.cpa)).toBeCloseTo(Number(live!.cpa), 1);
  });

  it('getSummary sem Meta conectada → 401 (contrato preservado)', async () => {
    connSpy.mockResolvedValueOnce(null as any);
    await populateRollup([insightRow()]);
    await expect(provider.getSummary(tenantId, RANGE.startDate, RANGE.endDate)).rejects.toMatchObject({
      statusCode: 401,
      code: 'META_NOT_CONNECTED',
    });
  });

  it('getDailyMetrics: série diária do rollup (sem Meta no request path)', async () => {
    await populateRollup([
      insightRow({ date_start: '2026-09-01', date_stop: '2026-09-01' }),
      insightRow({ date_start: '2026-09-02', date_stop: '2026-09-02', spend: '60.00' }),
    ]);
    insightsSpy.mockImplementation(async () => {
      throw new Error('META SHOULD NOT BE CALLED');
    });

    const daily = await provider.getDailyMetrics(tenantId, RANGE.startDate, RANGE.endDate);
    expect(daily).toHaveLength(2);
    expect(daily[0]!.date).toBe('2026-09-01');
    expect(Number(daily[0]!.spend)).toBeCloseTo(100, 2);
    expect(Number(daily[1]!.spend)).toBeCloseTo(60, 2);
    expect(daily[0]!.conversions).toBeGreaterThan(0); // parser live: link_click
  });

  it('getCampaigns: listagem com métricas do rollup + status live + paginação em memória', async () => {
    await populateRollup([
      insightRow({ campaign_id: 'camp_a', campaign_name: 'A', spend: '200.00' }),
      insightRow({ campaign_id: 'camp_b', campaign_name: 'B', spend: '100.00', date_start: '2026-09-05', date_stop: '2026-09-05' }),
      insightRow({ campaign_id: 'camp_c', campaign_name: 'C', spend: '30.00', date_start: '2026-09-06', date_stop: '2026-09-06' }),
    ]);
    // status live: A ativa, B pausada, C arquivada
    metaCampaignList.rows = [
      { id: 'camp_a', name: 'A', status: 'ACTIVE' },
      { id: 'camp_b', name: 'B', status: 'PAUSED' },
      { id: 'camp_c', name: 'C', status: 'ARCHIVED' },
    ];

    const page1 = await provider.getCampaigns(tenantId, RANGE.startDate, RANGE.endDate, undefined, 1, 2);
    expect(page1.pagination.total).toBe(3); // 3 campanhas com métricas no período
    expect(page1.data).toHaveLength(2); // limit 2
    expect(page1.data[0]!.metrics.spend).toBeGreaterThanOrEqual(page1.data[1]!.metrics.spend); // sort por spend

    const active = await provider.getCampaigns(tenantId, RANGE.startDate, RANGE.endDate, 'ACTIVE', 1, 10);
    expect(active.pagination.total).toBe(1);
    expect(active.data[0]!.id).toBe('camp_a');
  });

  it('fallback on-demand: range sem cobertura → busca Meta, upserta e responde', async () => {
    // re-aplica o mock padrão (teste anterior trocou por um que lança)
    insightsSpy.mockImplementation(async () => ({ data: metaInsightsByCall } as any));
    metaInsightsByCall.push(insightRow({ date_start: '2026-08-01', date_stop: '2026-08-01' }));

    // range ANTES da cobertura (rollup vazio em agosto) → on-demand
    const summary = await provider.getSummary(tenantId, '2026-08-01', '2026-08-31');
    expect(summary).not.toBeNull();
    expect(Number(summary!.spend)).toBeCloseTo(100, 2);

    // dado agora persistido no rollup (minDate = 08-01)
    const cov = await syncRepo.getCoverage();
    expect(cov.minDate).toBe('2026-08-01');

    // backfill popular só o dia 08-01: releitura do MESMO range ainda não
    // "cobre" a janela declarada (maxDate=08-01 < 08-31) → SEM nova chamada
    // só se o range pedido estiver contido na cobertura. Reconsulta o dia 1:
    insightsSpy.mockClear();
    const again = await provider.getSummary(tenantId, '2026-08-01', '2026-08-01');
    expect(Number(again!.spend)).toBeCloseTo(100, 2);
    expect(insightsSpy).not.toHaveBeenCalled();
  });

  it('on-demand não roda para ranges > 180 dias (proteção de quota)', async () => {
    insightsSpy.mockClear();
    const summary = await provider.getSummary(tenantId, '2020-01-01', '2026-09-30');
    expect(insightsSpy).not.toHaveBeenCalled();
    // responde com o que existe (vazio ou parcial) sem estourar quota
    expect(summary === null || typeof summary!.spend === 'number').toBe(true);
  });
});
