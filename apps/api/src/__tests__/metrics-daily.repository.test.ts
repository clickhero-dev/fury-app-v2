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
// tenantC: dedicado aos testes de status/coalesce (não polui tenantA, cujos
// testes são order-dependent sem cleanup por teste)
const tenantC = randomUUID();
const repoA = new MetricsDailyRepository(tenantA);
const repoC = new MetricsDailyRepository(tenantC);

function row(over: Partial<MetricsDailyUpsertRow> = {}): MetricsDailyUpsertRow {
  return {
    campaignMetaId: 'camp_1',
    date: '2026-09-01',
    campaignName: 'Campanha 1',
    objective: 'OUTCOME_ENGAGEMENT',
    status: 'ACTIVE',
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
  await sql`DELETE FROM metrics_daily WHERE tenant_id IN (${tenantA}, ${tenantB}, ${tenantC})`;
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
    expect(summary.daysCount).toBe(2); // dias distintos (substitui o hack `days`)
  });

  it('coalesce no upsert: re-upsert SEM status/objective não apaga snapshot anterior', async () => {
    // 1º upsert: snapshot completo (listagem da Meta)
    await repoC.upsertBatch([row({ campaignMetaId: 'camp_snap', date: '2026-09-03', status: 'PAUSED', objective: 'OUTCOME_SALES' })]);
    // 2º upsert (ex.: backfill on-demand, sem lista): NÃO pode zerar o snapshot
    await repoC.upsertBatch([row({ campaignMetaId: 'camp_snap', date: '2026-09-03', status: null, objective: null })]);

    const range = await repoC.getRange('2026-09-03', '2026-09-03');
    const snap = range.find((r) => r.campaignMetaId === 'camp_snap')!;
    expect(snap.status).toBe('PAUSED');
    expect(snap.objective).toBe('OUTCOME_SALES');
  });

  it('upsert atualiza status quando o novo valor vem preenchido', async () => {
    await repoC.upsertBatch([row({ campaignMetaId: 'camp_upd', date: '2026-09-03', status: 'ACTIVE' })]);
    await repoC.upsertBatch([row({ campaignMetaId: 'camp_upd', date: '2026-09-03', status: 'ARCHIVED' })]);
    const range = await repoC.getRange('2026-09-03', '2026-09-03');
    expect(range.find((r) => r.campaignMetaId === 'camp_upd')!.status).toBe('ARCHIVED');
  });

  it('getSummary com excluirArchived: linhas ARCHIVED/DELETED fora; NULL entra (padrão live)', async () => {
    // base do tenantC: ACTIVE 10.5/7 + NULL 1/1; archived 100/50 × 2 dias fora
    await repoC.upsertBatch([
      row({ campaignMetaId: 'camp_base', date: '2026-09-01', status: 'ACTIVE', spend: 10.5, conversions: 7 }),
      row({ campaignMetaId: 'camp_arch', date: '2026-09-01', status: 'ARCHIVED', spend: 100, conversions: 50 }),
      row({ campaignMetaId: 'camp_arch', date: '2026-09-02', status: 'ARCHIVED', spend: 100, conversions: 50 }),
      row({ campaignMetaId: 'camp_null', date: '2026-09-02', status: null, spend: 1, conversions: 1 }),
    ]);

    const tudo = await repoC.getSummary('2026-09-01', '2026-09-02');
    expect(Number(tudo.spend)).toBeCloseTo(211.5);

    const semArchived = await repoC.getSummary('2026-09-01', '2026-09-02', { excludeArchived: true });
    // ARCHIVED (200/100) fora; ACTIVE e NULL ficam
    expect(Number(semArchived.spend)).toBeCloseTo(11.5);
    expect(Number(semArchived.conversions)).toBeCloseTo(8);
    expect(semArchived.daysCount).toBe(2);

    // DELETED também é excluído
    await repoC.upsertBatch([row({ campaignMetaId: 'camp_del', date: '2026-09-01', status: 'DELETED', spend: 500, conversions: 0 })]);
    const semDeleted = await repoC.getSummary('2026-09-01', '2026-09-02', { excludeArchived: true });
    expect(Number(semDeleted.spend)).toBeCloseTo(11.5);
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
