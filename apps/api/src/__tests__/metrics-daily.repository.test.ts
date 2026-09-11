import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { MetricsDailyRepository, type MetricsDailyUpsertRow } from '../repository/metrics-daily.repository.js';

/**
 * T2 — MetricsDailyRepository (feature 014).
 * Integração real com fury_test: upsert idempotente, leituras agregadas,
 * cobertura de range e isolamento por tenant.
 */
const sql = postgres(
  process.env.TEST_DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_test',
  { max: 1, prepare: false }
);

const tenantA = randomUUID();
const tenantB = randomUUID();
const repoA = new MetricsDailyRepository(tenantA);

function row(over: Partial<MetricsDailyUpsertRow> = {}): MetricsDailyUpsertRow {
  return {
    campaignMetaId: 'camp_1',
    date: '2026-09-01',
    campaignName: 'Campanha 1',
    objective: 'OUTCOME_ENGAGEMENT',
    spend: 10.5,
    impressions: 1000,
    clicks: 50,
    ctr: 5,
    cpm: 10.5,
    cpc: 0.21,
    conversions: 7,
    roas: 1.5,
    cpa: 1.5,
    ...over,
  };
}

afterAll(async () => {
  await sql`DELETE FROM metrics_daily WHERE tenant_id IN (${tenantA}, ${tenantB})`;
  await sql.end();
});

describe('MetricsDailyRepository', () => {
  it('upsert insere e é idempotente (2× → contagem estável, valores atualizados)', async () => {
    await repoA.upsertBatch([row()]);
    const first = await repoA.getRange('2026-09-01', '2026-09-01');
    expect(first).toHaveLength(1);
    expect(Number(first[0]!.spend)).toBeCloseTo(10.5);

    // 2ª execução: mesma PK, valores diferentes → atualiza, não duplica
    await repoA.upsertBatch([row({ spend: 12.75, conversions: 9 })]);
    const second = await repoA.getRange('2026-09-01', '2026-09-01');
    expect(second).toHaveLength(1);
    expect(Number(second[0]!.spend)).toBeCloseTo(12.75);
    expect(Number(second[0]!.conversions)).toBeCloseTo(9);
  });

  it('upsertBatch processa múltiplas campanhas/dias', async () => {
    await repoA.upsertBatch([
      row({ campaignMetaId: 'camp_2', date: '2026-09-02', spend: 20 }),
      row({ campaignMetaId: 'camp_1', date: '2026-09-02', spend: 5 }),
    ]);
    const range = await repoA.getRange('2026-09-01', '2026-09-02');
    expect(range).toHaveLength(3); // camp_1 09-01, camp_2 09-02, camp_1 09-02
  });

  it('getDailySeries agrega por dia somando campanhas', async () => {
    const series = await repoA.getDailySeries('2026-09-01', '2026-09-02');
    const d1 = series.find((d) => d.date === '2026-09-01');
    const d2 = series.find((d) => d.date === '2026-09-02');
    expect(Number(d1!.spend)).toBeCloseTo(12.75);
    expect(Number(d2!.spend)).toBeCloseTo(25); // 20 + 5
  });

  it('getCampaignSeries retorna série de uma campanha (timeseries insights)', async () => {
    const series = await repoA.getCampaignSeries('camp_1', '2026-09-01', '2026-09-02');
    expect(series).toHaveLength(2);
    expect(series[0]!.date).toBe('2026-09-01');
    expect(Number(series[1]!.spend)).toBeCloseTo(5);
  });

  it('getSummary agrega totais do período', async () => {
    const summary = await repoA.getSummary('2026-09-01', '2026-09-02');
    expect(Number(summary.spend)).toBeCloseTo(37.75);
    expect(Number(summary.conversions)).toBeCloseTo(23); // 9 + 7 + 7 (3 linhas no range)
    expect(summary.days).toHaveLength(2);
  });

  it('getCampaignTotals agrega por campanha (listagem)', async () => {
    const totals = await repoA.getCampaignTotals('2026-09-01', '2026-09-02');
    expect(totals).toHaveLength(2); // camp_1, camp_2
    const camp1 = totals.find((t) => t.campaignMetaId === 'camp_1')!;
    expect(Number(camp1.spend)).toBeCloseTo(17.75);
    expect(camp1.campaignName).toBe('Campanha 1');
  });

  it('getCobertura devolve min/max date do tenant', async () => {
    const cov = await repoA.getCoverage();
    expect(cov.minDate).toBe('2026-09-01');
    expect(cov.maxDate).toBe('2026-09-02');
  });

  it('isolamento: dados de outro tenant invisíveis', async () => {
    const repoB = new MetricsDailyRepository(tenantB);
    await repoB.upsertBatch([row({ campaignMetaId: 'camp_B', spend: 999 })]);

    const onlyB = await repoB.getRange('2026-09-01', '2026-09-30');
    expect(onlyB).toHaveLength(1);
    expect(onlyB[0]!.campaignMetaId).toBe('camp_B');

    const onlyA = await repoA.getRange('2026-09-01', '2026-09-30');
    expect(onlyA.every((r) => r.campaignMetaId !== 'camp_B')).toBe(true);
  });

  it('operações numéricas retornam number (não string numeric)', async () => {
    const range = await repoA.getRange('2026-09-01', '2026-09-01');
    expect(typeof range[0]!.spend).toBe('number');
    expect(typeof range[0]!.impressions).toBe('number');
  });
});
