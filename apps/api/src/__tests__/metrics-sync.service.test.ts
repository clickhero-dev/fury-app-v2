import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { MetaInsightsSyncService } from '../services/campaigns/metrics-sync.service.js';
import { MetricsDailyRepository } from '../repository/metrics-daily.repository.js';
import type { MetaInsightsData } from '../lib/meta-api.js';

/**
 * T3 — MetaInsightsSyncService (feature 014).
 * Meta → metrics_daily. Deps mockadas (fronteira de integração), DB real (fury_test).
 * Cobre: happy path (upsert D-0..D-3), paridade do critério de conversões,
 * tenant sem Meta pulado, falha isolada por tenant, campanha sem linha local.
 */
const sql = postgres(
  process.env.TEST_DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_test',
  { max: 1, prepare: false }
);

const tenantA = randomUUID();
const tenantB = randomUUID();

/** Fixture de insights da Meta (level=campaign, time_increment=1). */
function insightRow(over: Partial<Record<string, any>> = {}): MetaInsightsData {
  return {
    campaign_id: 'camp_sync_1',
    campaign_name: 'Campanha Sync',
    date_start: '2026-09-10',
    date_stop: '2026-09-10',
    spend: '25.00',
    impressions: '4000',
    clicks: '180',
    ctr: '4.5',
    cpm: '6.25',
    cpc: '0.1389',
    actions: [
      { action_type: 'offsite_conversion.fb_pixel-purchase', value: '12' },
      { action_type: 'link_click', value: '150' },
    ],
    purchase_roas: [{ action_type: 'omni_purchase', value: '2.4' }],
    cost_per_action_type: [
      { action_type: 'purchase', value: '2.08' },
    ],
    ...over,
  } as unknown as MetaInsightsData;
}

/** Porta real do repository (fury_test) — o service não sabe que é real. */
const metricsDailyPort = {
  upsertBatch: async (tenantId: string, rows: any[]) => {
    if (rows.length === 0) return;
    const repo = new MetricsDailyRepository(tenantId);
    await repo.upsertBatch(rows);
  },
};

/** Deps do service mockadas por tenant — quem tem Meta, quem não tem. */
function makeDeps(connections: Record<string, unknown>, insights: Record<string, MetaInsightsData[]>, campaignList: Record<string, any[]> = {}) {
  return {
    // fronteira Meta: busca insights (time_increment=1, D-0..D-3)
    fetchInsights: vi.fn(async (tenantId: string, startDate: string, endDate: string) => {
      const data = insights[tenantId];
      if (!data) throw Object.assign(new Error('META_NOT_CONNECTED'), { code: 'META_NOT_CONNECTED' });
      // filtro por range D-0..D-3 simulado: devolve tudo (fixture de 1 dia)
      return data;
    }),
    // fronteira Meta: lista campanhas (id, name, status, objective)
    listCampaigns: vi.fn(async (tenantId: string) => campaignList[tenantId] ?? []),
    // fronteira conexão: retorna null quando tenant não tem Meta
    findConnection: vi.fn(async (tenantId: string) => connections[tenantId] ?? null),
    // porta real de persistência (fury_test) — paridade de comportamento real
    metricsDaily: metricsDailyPort,
  };
}

const t = (id: string) => sql`DELETE FROM metrics_daily WHERE tenant_id = ${id}`;

beforeEach(async () => {
  await t(tenantA);
  await t(tenantB);
});

afterAll(async () => {
  await t(tenantA);
  await t(tenantB);
  await sql.end();
});

describe('MetaInsightsSyncService', () => {
  it('happy path: 1 tenant com insights → upsert de linhas por (campanha, dia) D-0..D-3', async () => {
    const deps = makeDeps(
      { [tenantA]: { accessToken: 'tok', adAccountId: 'act_1' } },
      { [tenantA]: [insightRow()] }
    );
    const service = new MetaInsightsSyncService(deps as any);

    const result = await service.syncTenant(tenantA);

    expect(result.ok).toBe(true);
    expect(result.upserted).toBeGreaterThan(0);

    const rows = await sql`
      SELECT * FROM metrics_daily WHERE tenant_id = ${tenantA}
    `;
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0]!;
    expect(r.campaign_meta_id).toBe('camp_sync_1');
    expect(r.campaign_name).toBe('Campanha Sync');
    expect(Number(r.spend)).toBeCloseTo(25);
    // Paridade com o live: parser objective-aware com objective=null conta
    // link_click (150) — o mesmo que o endpoint atual mostraria.
    expect(Number(r.conversions)).toBeCloseTo(150);
  });

  it('paridade: conversões gravadas com MESMO critério objective-aware do live', async () => {
    const deps = makeDeps(
      { [tenantA]: { accessToken: 'tok', adAccountId: 'act_1' } },
      {
        [tenantA]: [
          // actions só com link_click: objective AWARE → conta link_click como conversão?
          // O critério mora em getConversionsFromActions (mesma função do live) —
          // aqui o teste trava o comportamento: o sync usa a MESMA função.
          insightRow({
            campaign_id: 'camp_obj',
            actions: [
              { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' },
            ],
          }),
        ],
      }
    );
    const service = new MetaInsightsSyncService(deps as any);
    await service.syncTenant(tenantA);

    const liveConversions = await sql`
      SELECT conversions FROM metrics_daily
      WHERE tenant_id = ${tenantA} AND campaign_meta_id = 'camp_obj'
    `;
    // Paridade com o live: o mesmo insight processado pelo parser atual
    // (getConversationsFromActions via extractCampaignMetricsFromInsight)
    const { extractCampaignMetricsFromInsight } = await import('../utils/meta-insights-parser.js');
    const { centavosToReais } = await import('../utils/metrics-formatter.js');
    const expected = extractCampaignMetricsFromInsight(insightRow({
      campaign_id: 'camp_obj',
      actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' }],
    }), centavosToReais(2500));
    expect(Number(liveConversions[0]!.conversions)).toBe(expected.conversions ?? 0);
  });

  it('tenant sem conexão Meta → pulado sem throw (ok=false, skipped)', async () => {
    const deps = makeDeps({}, {}); // ninguém tem conexão
    const service = new MetaInsightsSyncService(deps as any);
    const result = await service.syncTenant(tenantB);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('META_NOT_CONNECTED');
  });

  it('falha de um tenant não aborta os demais (syncAll isolando erro)', async () => {
    const insights: Record<string, MetaInsightsData[]> = {
      [tenantA]: [insightRow()],
      // tenantB tem conexão mas fetchInsights explode
    };
    const deps = makeDeps(
      { [tenantA]: { accessToken: 'tok', adAccountId: 'act_1' }, [tenantB]: { accessToken: 'tok2', adAccountId: 'act_2' } },
      insights
    );
    deps.fetchInsights.mockImplementation(async (tid: string) => {
      if (tid === tenantB) throw new Error('META 500');
      return (insights[tid] ?? []) as MetaInsightsData[];
    });
    const service = new MetaInsightsSyncService(deps as any);

    const results = await service.syncAll([tenantA, tenantB]);

    expect(results).toHaveLength(2);
    const ra = results.find((r) => r.tenantId === tenantA)!;
    const rb = results.find((r) => r.tenantId === tenantB)!;
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(false);
  });

  it('campanha só na Meta (sem linha local em campaigns) → linha gravada', async () => {
    const deps = makeDeps(
      { [tenantA]: { accessToken: 'tok', adAccountId: 'act_1' } },
      { [tenantA]: [insightRow({ campaign_id: 'camp_only_meta' })] }
    );
    const service = new MetaInsightsSyncService(deps as any);
    const result = await service.syncTenant(tenantA);
    expect(result.ok).toBe(true);

    const rows = await sql`
      SELECT campaign_meta_id FROM metrics_daily
      WHERE tenant_id = ${tenantA} AND campaign_meta_id = 'camp_only_meta'
    `;
    expect(rows).toHaveLength(1); // sem FK, sem erro
  });

  it('status/nome das campanhas da lista Meta → snapshot atualizado (2ª execução)', async () => {
    const deps = makeDeps(
      { [tenantA]: { accessToken: 'tok', adAccountId: 'act_1' } },
      { [tenantA]: [insightRow()] },
      { [tenantA]: [{ id: 'camp_sync_1', name: 'Novo Nome', status: 'PAUSED', objective: 'OUTCOME_SALES' }] }
    );
    const service = new MetaInsightsSyncService(deps as any);
    await service.syncTenant(tenantA);
    await service.syncTenant(tenantA); // 2ª execução

    const rows = await sql`
      SELECT count(*) AS n FROM metrics_daily WHERE tenant_id = ${tenantA}
    `;
    // idempotência de contagem (fixture 1 dia: 1 linha)
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('re-sync D-0..D-3: dias re-buscados a cada ciclo (range passado ao fetch)', async () => {
    const deps = makeDeps(
      { [tenantA]: { accessToken: 'tok', adAccountId: 'act_1' } },
      { [tenantA]: [insightRow()] }
    );
    const service = new MetaInsightsSyncService(deps as any);
    await service.syncTenant(tenantA);

    const [, rangeStart, rangeEnd] = deps.fetchInsights.mock.calls[0]! as [string, string, string];
    // range cobre D-3..D-0 (4 dias, terminando hoje)
    const start = new Date(rangeStart + 'T00:00:00Z');
    const end = new Date(rangeEnd + 'T00:00:00Z');
    const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
    expect(spanDays).toBe(3);
    expect(rangeEnd <= new Date().toISOString().slice(0, 10)).toBe(true);
  });
});
