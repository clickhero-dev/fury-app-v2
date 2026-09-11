import { and, between, eq, sql } from 'drizzle-orm';
import { metricsDaily } from '@fury/db';
import { db as defaultDb, type Database } from '@fury/db';
import { TenantScopedRepository } from './base.repository.js';

/**
 * Repositório tenant-bound de `metrics_daily` (feature 014 — ADR-0001).
 * Única porta de persistência da tabela de rollup diário de insights.
 *
 * Grão: 1 linha = 1 tenant × 1 campanha Meta × 1 dia (PK composta).
 * Todas as leituras já retornam números (numeric do PG vira string no driver —
 * conversão feita aqui para não vazar `string` para services).
 *
 * Snapshot de status/objective (fix QA #173): gravados pelo sync (lista Meta);
 * upsert usa coalesce — backfill on-demand (sem lista) não apaga snapshot.
 */

export interface MetricsDailyUpsertRow {
  campaignMetaId: string;
  /** Dia Meta (date_start do insight), formato YYYY-MM-DD. */
  date: string;
  campaignName?: string | null;
  objective?: string | null;
  /** Snapshot do status live da lista Meta (ACTIVE/PAUSED/ARCHIVED/DELETED). */
  status?: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  conversions: number;
  roas?: number | null;
  cpa?: number | null;
}

export interface MetricsDailyRow {
  campaignMetaId: string;
  date: string;
  campaignName: string | null;
  objective: string | null;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  conversions: number;
  roas: number | null;
  cpa: number | null;
}

export interface DailySeriesRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** ROAS agregado do dia: Σ(action_value)/Σ(spend) — ponderado, não média. */
  roas: number | null;
}

export interface CampaignTotalRow {
  campaignMetaId: string;
  campaignName: string | null;
  objective: string | null;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** ROAS ponderado do período: Σ(roas×spend)/Σ(spend). */
  roas: number | null;
  cpa: number | null;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

export class MetricsDailyRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  /**
   * Upsert idempotente em lote: executar 2× atualiza valores, nunca duplica.
   * updatedAt sempre renovado (rastreia último sync da linha).
   * coalesce(status/objective): valor novo só sobrescreve quando vem preenchido —
   * backfill on-demand (sem lista de campanhas) não apaga o snapshot do sync.
   */
  async upsertBatch(rows: MetricsDailyUpsertRow[]): Promise<void> {
    if (rows.length === 0) return;

    await this.db
      .insert(metricsDaily)
      .values(
        rows.map((r) => ({
          tenantId: this.tenantId,
          campaignMetaId: r.campaignMetaId,
          date: r.date,
          campaignName: r.campaignName ?? null,
          objective: r.objective ?? null,
          status: r.status ?? null,
          spend: r.spend.toFixed(2),
          impressions: r.impressions,
          clicks: r.clicks,
          ctr: r.ctr.toFixed(4),
          cpm: r.cpm.toFixed(4),
          cpc: r.cpc.toFixed(4),
          conversions: r.conversions.toFixed(4),
          roas: r.roas != null ? r.roas.toFixed(4) : null,
          cpa: r.cpa != null ? r.cpa.toFixed(2) : null,
          updatedAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: [metricsDaily.tenantId, metricsDaily.campaignMetaId, metricsDaily.date],
        set: {
          campaignName: sql`coalesce(excluded.campaign_name, ${metricsDaily.campaignName})`,
          objective: sql`coalesce(excluded.objective, ${metricsDaily.objective})`,
          status: sql`coalesce(excluded.status, ${metricsDaily.status})`,
          spend: sql`excluded.spend`,
          impressions: sql`excluded.impressions`,
          clicks: sql`excluded.clicks`,
          ctr: sql`excluded.ctr`,
          cpm: sql`excluded.cpm`,
          cpc: sql`excluded.cpc`,
          conversions: sql`excluded.conversions`,
          roas: sql`excluded.roas`,
          cpa: sql`excluded.cpa`,
          updatedAt: new Date(),
        },
      });
  }

  /** Linhas cruas do tenant num range (inclusive). */
  async getRange(startDate: string, endDate: string): Promise<MetricsDailyRow[]> {
    const rows = await this.db
      .select()
      .from(metricsDaily)
      .where(
        and(
          eq(metricsDaily.tenantId, this.tenantId),
          between(metricsDaily.date, startDate, endDate)
        )
      )
      .orderBy(metricsDaily.date, metricsDaily.campaignMetaId);

    return rows.map((r) => ({
      campaignMetaId: r.campaignMetaId,
      date: r.date,
      campaignName: r.campaignName,
      objective: r.objective,
      status: r.status,
      spend: num(r.spend),
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: num(r.ctr),
      cpm: num(r.cpm),
      cpc: num(r.cpc),
      conversions: num(r.conversions),
      roas: numOrNull(r.roas),
      cpa: numOrNull(r.cpa),
    }));
  }

  /** Série diária agregada (todas as campanhas do tenant) — alimenta /metrics/daily. */
  async getDailySeries(startDate: string, endDate: string): Promise<DailySeriesRow[]> {
    const rows = await this.db
      .select({
        date: metricsDaily.date,
        spend: sql<string>`sum(${metricsDaily.spend})`,
        impressions: sql<string>`sum(${metricsDaily.impressions})`,
        clicks: sql<string>`sum(${metricsDaily.clicks})`,
        conversions: sql<string>`sum(${metricsDaily.conversions})`,
        // ROAS ponderado: Σ(roas×spend)/Σ(spend) — skip roas null
        roas: sql<string | null>`sum(${metricsDaily.roas} * ${metricsDaily.spend}) / nullif(sum(${metricsDaily.spend}), 0)`,
      })
      .from(metricsDaily)
      .where(
        and(
          eq(metricsDaily.tenantId, this.tenantId),
          between(metricsDaily.date, startDate, endDate)
        )
      )
      .groupBy(metricsDaily.date)
      .orderBy(metricsDaily.date);

    return rows.map((r) => ({
      date: r.date,
      spend: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      conversions: num(r.conversions),
      roas: numOrNull(r.roas),
    }));
  }

  /** Série diária de UMA campanha — alimenta timeseries de /campaigns/:id/insights. */
  async getCampaignSeries(
    campaignMetaId: string,
    startDate: string,
    endDate: string
  ): Promise<DailySeriesRow[]> {
    const rows = await this.db
      .select({
        date: metricsDaily.date,
        spend: sql<string>`sum(${metricsDaily.spend})`,
        impressions: sql<string>`sum(${metricsDaily.impressions})`,
        clicks: sql<string>`sum(${metricsDaily.clicks})`,
        conversions: sql<string>`sum(${metricsDaily.conversions})`,
        roas: sql<string | null>`sum(${metricsDaily.roas} * ${metricsDaily.spend}) / nullif(sum(${metricsDaily.spend}), 0)`,
      })
      .from(metricsDaily)
      .where(
        and(
          eq(metricsDaily.tenantId, this.tenantId),
          eq(metricsDaily.campaignMetaId, campaignMetaId),
          between(metricsDaily.date, startDate, endDate)
        )
      )
      .groupBy(metricsDaily.date)
      .orderBy(metricsDaily.date);

    return rows.map((r) => ({
      date: r.date,
      spend: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      conversions: num(r.conversions),
      roas: numOrNull(r.roas),
    }));
  }

  /**
   * Totais agregados do tenant no período — alimenta /metrics/summary.
   * @param opts.excludeArchived restaura a semântica live (só ACTIVE/PAUSED):
   *   linhas com status ARCHIVED/DELETED ficam fora; status NULL entra
   *   (linhas de backfill antigo — não descartar dado silenciosamente).
   */
  async getSummary(
    startDate: string,
    endDate: string,
    opts: { excludeArchived?: boolean } = {}
  ): Promise<{
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    roas: number | null;
    cpa: number | null;
    daysCount: number;
  }> {
    const filters = [
      eq(metricsDaily.tenantId, this.tenantId),
      between(metricsDaily.date, startDate, endDate),
    ];
    if (opts.excludeArchived) {
      // status null → true (entra); ARCHIVED/DELETED → false (fora)
      filters.push(
        sql`(${metricsDaily.status} IS NULL OR (${metricsDaily.status} <> 'ARCHIVED' AND ${metricsDaily.status} <> 'DELETED'))`
      );
    }

    const [agg] = await this.db
      .select({
        spend: sql<string>`coalesce(sum(${metricsDaily.spend}), 0)`,
        impressions: sql<string>`coalesce(sum(${metricsDaily.impressions}), 0)`,
        clicks: sql<string>`coalesce(sum(${metricsDaily.clicks}), 0)`,
        conversions: sql<string>`coalesce(sum(${metricsDaily.conversions}), 0)`,
        roas: sql<string | null>`sum(${metricsDaily.roas} * ${metricsDaily.spend}) / nullif(sum(${metricsDaily.spend}), 0)`,
        distinctDays: sql<string>`count(distinct ${metricsDaily.date})`,
      })
      .from(metricsDaily)
      .where(and(...filters));

    const spend = num(agg?.spend);
    const conversions = num(agg?.conversions);
    const daysCount = num(agg?.distinctDays);

    return {
      spend,
      impressions: num(agg?.impressions),
      clicks: num(agg?.clicks),
      conversions,
      roas: numOrNull(agg?.roas),
      cpa: conversions > 0 ? spend / conversions : null,
      daysCount,
    };
  }

  /** Totais por campanha no período — alimenta listagem /metrics/campaigns. */
  async getCampaignTotals(startDate: string, endDate: string): Promise<CampaignTotalRow[]> {
    const rows = await this.db
      .select({
        campaignMetaId: metricsDaily.campaignMetaId,
        campaignName: sql<string | null>`max(${metricsDaily.campaignName})`,
        objective: sql<string | null>`max(${metricsDaily.objective})`,
        status: sql<string | null>`max(${metricsDaily.status})`,
        spend: sql<string>`sum(${metricsDaily.spend})`,
        impressions: sql<string>`sum(${metricsDaily.impressions})`,
        clicks: sql<string>`sum(${metricsDaily.clicks})`,
        conversions: sql<string>`sum(${metricsDaily.conversions})`,
        roas: sql<string | null>`sum(${metricsDaily.roas} * ${metricsDaily.spend}) / nullif(sum(${metricsDaily.spend}), 0)`,
      })
      .from(metricsDaily)
      .where(
        and(
          eq(metricsDaily.tenantId, this.tenantId),
          between(metricsDaily.date, startDate, endDate)
        )
      )
      .groupBy(metricsDaily.campaignMetaId);

    return rows.map((r) => {
      const spend = num(r.spend);
      const conversions = num(r.conversions);
      return {
        campaignMetaId: r.campaignMetaId,
        campaignName: r.campaignName,
        objective: r.objective,
        status: r.status,
        spend,
        impressions: num(r.impressions),
        clicks: num(r.clicks),
        conversions,
        roas: numOrNull(r.roas),
        cpa: conversions > 0 ? spend / conversions : null,
      };
    });
  }

  /** Cobertura atual do rollup p/ decidir fallback on-demand (min/max date). */
  async getCoverage(): Promise<{ minDate: string | null; maxDate: string | null }> {
    const [row] = await this.db
      .select({
        minDate: sql<string | null>`min(${metricsDaily.date})`,
        maxDate: sql<string | null>`max(${metricsDaily.date})`,
      })
      .from(metricsDaily)
      .where(eq(metricsDaily.tenantId, this.tenantId));

    return { minDate: row?.minDate ?? null, maxDate: row?.maxDate ?? null };
  }
}
