import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { MetaInsightsSyncService } from '../services/campaigns/metrics-sync.service.js';
import { MetricsDailyRepository } from '../repository/metrics-daily.repository.js';
import type { MetaInsightsData } from '../lib/meta-api.js';

/**
 * T10b — Backfill incremental no job de sync (feature 014).
 * Objetivo (decisão do Diogo): NENHUM usuário paga custo on-demand —
 * o job cobre uma janela de cobertura (config, default 90d) buscando só
 * o que falta na tabela; re-sync D-0..D-3 continua garantido todo ciclo.
 * Quota: chamadas por ciclo = (dias faltantes / janela Meta) + 1 lista leve.
 */
const sql = postgres(
  process.env.TEST_DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_test',
  { max: 1, prepare: false }
);

const tenantA = randomUUID();
const metricsDailyPort = {
  upsertBatch: async (tenantId: string, rows: any[]) => {
    if (rows.length === 0) return;
    await new MetricsDailyRepository(tenantId).upsertBatch(rows);
  },
};
const coveragePort = {
  getCoverage: async (tenantId: string) => new MetricsDailyRepository(tenantId).getCoverage(),
};

function insightRow(date: string, campaignId = 'camp_bf'): MetaInsightsData {
  return {
    campaign_id: campaignId,
    campaign_name: 'Backfill',
    date_start: date,
    date_stop: date,
    spend: '10.00',
    impressions: '100',
    clicks: '10',
    actions: [{ action_type: 'link_click', value: '8' }],
    purchase_roas: [{ action_type: 'omni_purchase', value: '1.2' }],
  } as unknown as MetaInsightsData;
}

/** Insights fictícios por (range) — gera 1 linha por dia do range. */
function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start + 'T00:00:00Z');
  const stop = new Date(end + 'T00:00:00Z');
  while (cur <= stop) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

interface Call { start: string; end: string }
function makeDeps(existingCoverage: { minDate: string | null; maxDate: string | null }, coverageWindowDays?: number) {
  const calls: Call[] = [];
  const deps = {
    fetchInsights: vi.fn(async (_t: string, startDate: string, endDate: string) => {
      calls.push({ start: startDate, end: endDate });
      return daysBetween(startDate, endDate).map((d) => insightRow(d));
    }),
    listCampaigns: vi.fn(async () => []),
    findConnection: vi.fn(async () => ({ accessToken: 'tok', adAccountId: 'act_1' })),
    metricsDaily: metricsDailyPort,
    getCoverage: vi.fn(async () => existingCoverage),
    coverageWindowDays,
  };
  return { deps, calls };
}

beforeEach(async () => {
  await sql`DELETE FROM metrics_daily WHERE tenant_id = ${tenantA}`;
});

afterAll(async () => {
  await sql`DELETE FROM metrics_daily WHERE tenant_id = ${tenantA}`;
  await sql.end();
});

const TODAY = new Date('2026-09-10T12:00:00Z');

describe('backfill incremental (syncTenant com janela de cobertura)', () => {
  it('tabela VAZIA + janela 90d → 1 chamada cobrindo os 90 dias (D-90..D-0)', async () => {
    const { deps, calls } = makeDeps({ minDate: null, maxDate: null }, 90);
    const service = new MetaInsightsSyncService(deps as any);

    await service.syncTenant(tenantA, TODAY);

    expect(calls).toHaveLength(1);
    // 90 dias atrás de 2026-09-10 = 2026-06-13
    expect(calls[0]!.start).toBe('2026-06-13');
    expect(calls[0]!.end).toBe('2026-09-10');

    // gravado: 90 dias × 1 campanha
    const rows = await sql`SELECT count(*) AS n FROM metrics_daily WHERE tenant_id = ${tenantA}`;
    expect(Number(rows[0]!.n)).toBe(90);
  });

  it('cobertura já recente (min=D-3..D-0 ok) → só re-sync D-0..D-3 (1 chamada curta)', async () => {
    const { deps, calls } = makeDeps({ minDate: '2026-09-07', maxDate: '2026-09-10' }, 90);
    const service = new MetaInsightsSyncService(deps as any);

    await service.syncTenant(tenantA, TODAY);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.start).toBe('2026-09-07'); // D-3
    expect(calls[0]!.end).toBe('2026-09-10');
  });

  it('lacuna no MEIO da janela (min antigo, max D-0) → 1 chamada do min ao hoje', async () => {
    const { deps, calls } = makeDeps({ minDate: '2026-06-13', maxDate: '2026-09-10' }, 90);
    const service = new MetaInsightsSyncService(deps as any);

    await service.syncTenant(tenantA, TODAY);

    // já cobre até hoje: re-sync D-0..D-3 (janela curta)
    expect(calls).toHaveLength(1);
    expect(calls[0]!.start).toBe('2026-09-07');
    expect(calls[0]!.end).toBe('2026-09-10');
  });

  it('janela 90d mas cobertura começa D-30 (max antigo) → backfill do max+1 até hoje', async () => {
    const { deps, calls } = makeDeps({ minDate: '2026-08-11', maxDate: '2026-08-11' }, 90);
    const service = new MetaInsightsSyncService(deps as any);

    await service.syncTenant(tenantA, TODAY);

    // precisa cobrir 2026-08-12..2026-09-10 (30 dias) + re-sync
    expect(calls).toHaveLength(1);
    expect(calls[0]!.start).toBe('2026-08-11'); // re-sync retroativo inclui min atual
    expect(calls[0]!.end).toBe('2026-09-10');
  });

  it('SEM janela config (default) → comportamento atual (D-0..D-3, 1 chamada)', async () => {
    const { deps, calls } = makeDeps({ minDate: null, maxDate: null });
    const service = new MetaInsightsSyncService(deps as any);

    await service.syncTenant(tenantA, TODAY);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.start).toBe('2026-09-07');
    expect(calls[0]!.end).toBe('2026-09-10');
  });

  it('janela maior que 180d é limitada a 180 (proteção de quota)', async () => {
    const { deps, calls } = makeDeps({ minDate: null, maxDate: null }, 365);
    const service = new MetaInsightsSyncService(deps as any);

    await service.syncTenant(tenantA, TODAY);

    expect(calls).toHaveLength(1);
    // 180 dias inclusivos: 09-10 − 179d = 2026-03-15
    expect(calls[0]!.start).toBe('2026-03-15');
    expect(calls[0]!.end).toBe('2026-09-10');
  });
});
