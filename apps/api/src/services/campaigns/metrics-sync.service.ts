import { MetaInsightsSyncDeps, MetricsDailyUpsertRow } from './sync-types.js';
import { extractCampaignMetricsFromInsight } from '../../utils/meta-insights-parser.js';
import { centavosToReais } from '../../utils/metrics-formatter.js';
import type { MetaInsightsData } from '../../lib/meta-api.js';

export type { MetaInsightsSyncDeps, MetricsDailyUpsertRow };

/**
 * MetaInsightsSyncService (feature 014) — sincroniza insights da Meta para
 * `metrics_daily` (grão tenant × campanha Meta × dia).
 *
 * Paridade por construção (FR-011): normaliza conversões/roas/cpa com as MESMAS
 * funções do caminho live (`extractCampaignMetricsFromInsight`), de modo que o
 * rollup reproduza os números dos endpoints atuais.
 *
 * Re-sync D-0..D-3 a cada ciclo (a Meta revisa insights retroativos).
 * Idempotente: upsert por PK composta. Falha isolada por tenant.
 */
export class MetaInsightsSyncService {
  /** Janela re-sincronizada por ciclo: hoje + 3 dias retroativos. */
  static readonly RESYNC_DAYS = 3;

  constructor(private readonly deps: MetaInsightsSyncDeps) {}

  /** Range D-N..D-0 (YYYY-MM-DD) em fuso de São Paulo. */
  private syncRange(today = new Date()): { startDate: string; endDate: string } {
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
    const start = new Date(today);
    start.setDate(start.getDate() - MetaInsightsSyncService.RESYNC_DAYS);
    return { startDate: fmt(start), endDate: fmt(today) };
  }

  /** Normaliza 1 insight (campanha-dia) para linha de upsert — MESMO critério do live. */
  private toUpsertRow(insight: MetaInsightsData, statusMeta: string | null): MetricsDailyUpsertRow | null {
    const campaignId = insight.campaign_id;
    if (!campaignId) return null;

    const spendInReais = centavosToReais(Math.round(parseFloat(insight.spend || '0') * 100));
    const { roas, cpa, conversions } = extractCampaignMetricsFromInsight(insight, spendInReais);

    return {
      campaignMetaId: campaignId,
      date: insight.date_start || insight.date_stop || '',
      campaignName: insight.campaign_name ?? null,
      objective: null, // objective-aware já resolvido dentro do parser (conversions)
      spend: spendInReais,
      impressions: parseInt(insight.impressions || '0', 10),
      clicks: parseInt(insight.clicks || '0', 10),
      ctr: parseFloat(insight.ctr || '0'),
      cpm: parseFloat(insight.cpm || '0'),
      cpc: parseFloat(insight.cpc || '0'),
      conversions: conversions ?? 0,
      roas,
      cpa,
    };
  }

  /**
   * Sincroniza 1 tenant: insights D-0..D-3 → upsert.
   * Nunca lança: retorna resultado com ok/reason (worker agrega e loga).
   */
  async syncTenant(
    tenantId: string,
    today = new Date()
  ): Promise<{ tenantId: string; ok: boolean; reason?: string; upserted: number }> {
    try {
      const connection = await this.deps.findConnection(tenantId);
      if (!connection) {
        return { tenantId, ok: false, reason: 'META_NOT_CONNECTED', upserted: 0 };
      }

      const { startDate, endDate } = this.syncRange(today);
      const insights = await this.deps.fetchInsights(tenantId, startDate, endDate);

      // status/nome live da lista de campanhas (chamada leve do mesmo ciclo)
      let campaignMeta: Record<string, { name?: string; status?: string; objective?: string }> = {};
      try {
        campaignMeta = Object.fromEntries(
          (await this.deps.listCampaigns(tenantId)).map((c) => [c.id, c])
        );
      } catch {
        // lista de campanhas é best-effort; insights são o dado crítico
      }

      const rows = insights
        .map((i) => {
          const row = this.toUpsertRow(i, campaignMeta[i.campaign_id || '']?.status ?? null);
          if (!row || !row.date) return null;
          // snapshot: nome da lista da Meta tem prioridade (mais atual que o insight)
          const nameFromList = campaignMeta[i.campaign_id || '']?.name;
          if (nameFromList) row.campaignName = nameFromList;
          return row;
        })
        .filter((r): r is MetricsDailyUpsertRow => r !== null);

      await this.deps.metricsDaily.upsertBatch(tenantId, rows);

      return { tenantId, ok: true, upserted: rows.length };
    } catch (err: any) {
      const reason =
        err?.code === 'META_NOT_CONNECTED'
          ? 'META_NOT_CONNECTED'
          : err?.code === 'NO_AD_ACCOUNT'
            ? 'NO_AD_ACCOUNT'
            : `ERROR: ${err?.message ?? String(err)}`;
      return { tenantId, ok: false, reason, upserted: 0 };
    }
  }

  /** Sincroniza vários tenants; falha de um não interrompe os demais (FR-005). */
  async syncAll(
    tenantIds: string[],
    today = new Date()
  ): Promise<{ tenantId: string; ok: boolean; reason?: string; upserted: number }[]> {
    const results: { tenantId: string; ok: boolean; reason?: string; upserted: number }[] = [];
    for (const tenantId of tenantIds) {
      results.push(await this.syncTenant(tenantId, today));
    }
    return results;
  }
}
