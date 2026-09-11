import type { MetaInsightsData } from '../../lib/meta-api.js';

/**
 * Tipos de fronteira do MetaInsightsSyncService (feature 014).
 * Injetados no construtor (Testable Design — constituição III).
 *
 * Nota ADR-0001: `MetricsDailyRepoPort.upsertBatch` recebe `tenantId` explícito
 * porque o sync itera vários tenants (o repository tenant-bound é instanciado
 * pelo adapter injetado — o service não cria repos).
 */

export interface MetricsDailyUpsertRow {
  campaignMetaId: string;
  date: string;
  campaignName?: string | null;
  objective?: string | null;
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
}
