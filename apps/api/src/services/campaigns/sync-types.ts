import type { MetaInsightsData } from '../../lib/meta-api.js';

/**
 * Tipos de fronteira do MetaInsightsSyncService (feature 014).
 * Injetados no construtor (Testable Design — constituição III).
 *
 * Nota ADR-0001: `MetricsDailyRepoPort.upsertBatch` recebe `tenantId` explícito
 * porque o sync itera vários tenants (o repository tenant-bound é instanciado
 * pelo adapter injetado — o service não cria repos).
 */

// Tipo canônico mora no repositório (dono da forma da linha de persistência).
// Antes era duplicado aqui (nit do QA #173) — agora é re-exportado.
export type { MetricsDailyUpsertRow } from '../../repository/metrics-daily.repository.js';
import type { MetricsDailyUpsertRow } from '../../repository/metrics-daily.repository.js';

export interface MetaConnectionRef {
  accessToken: string;
  adAccountId: string;
}

export interface MetaCampaignListRow {
  id: string;
  name?: string;
  status?: string;
  objective?: string;
}

export interface MetaInsightsSyncDeps {
  /** Busca insights level=campaign, time_increment=1, no range (D-0..D-3). */
  fetchInsights(tenantId: string, startDate: string, endDate: string): Promise<MetaInsightsData[]>;
  /** Lista campanhas da conta (id, name, status, objective) — snapshot de status/nome. */
  listCampaigns(tenantId: string): Promise<MetaCampaignListRow[]>;
  /** Conexão Meta do tenant (null = sem conexão). */
  findConnection(tenantId: string): Promise<MetaConnectionRef | null>;
  /** Porta de persistência do rollup (upsert idempotente). */
  metricsDaily: {
    upsertBatch(tenantId: string, rows: MetricsDailyUpsertRow[]): Promise<void>;
  };
  /** Cobertura atual do rollup do tenant (min/max date) — backfill incremental (T10b). */
  getCoverage(tenantId: string): Promise<{ minDate: string | null; maxDate: string | null }>;
  /** Janela de cobertura do sync (dias). Default: só re-sync D-0..D-3. */
  coverageWindowDays?: number;
}
