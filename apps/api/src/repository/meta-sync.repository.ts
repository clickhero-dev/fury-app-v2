import {
  db as defaultDb,
  type Database,
  metaCampaignSnapshots,
  metaCampaignDailyInsights,
  metaLeads,
  metaInstagramMedia,
  metaSyncRuns,
  metaSyncScopes,
  campaigns,
} from '@fury/db';
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type CampaignSnapshot = typeof metaCampaignSnapshots.$inferSelect;
type CampaignDailyInsight = typeof metaCampaignDailyInsights.$inferSelect;
type MetaLead = typeof metaLeads.$inferSelect;
type InstagramMedia = typeof metaInstagramMedia.$inferSelect;
type SyncRun = typeof metaSyncRuns.$inferSelect;

export interface CampaignSnapshotUpsert {
  metaCampaignId: string;
  name: string;
  status?: string | null;
  objective?: string | null;
  budget?: unknown;
  metrics?: unknown;
  hasLeadForm?: boolean;
  lastInsightsAt?: Date | null;
}

export interface CampaignDailyInsightUpsert {
  metaCampaignId: string;
  date: string;
  metrics: unknown;
}

export interface MetaLeadUpsert {
  metaLeadId: string;
  snapshotId?: string | null;
  metaCampaignId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  createdTime?: Date | null;
}

export interface InstagramMediaUpsert {
  mediaId: string;
  caption?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: string | null;
  mediaProductType?: string | null;
  timestamp?: Date | null;
  likeCount?: number | null;
  commentsCount?: number | null;
  insights?: unknown;
}

export interface RecordSyncRunInput {
  status: 'running' | 'success' | 'partial' | 'failed';
  errorCode?: string | null;
  errorMessage?: string | null;
  partialFailures?: unknown;
  campaignsCount?: number;
  leadsCount?: number;
  insightsCount?: number;
}
export interface MetaSyncScopeInput { connectionId: string; metaUserId: string; adAccountId: string; instagramUserId?: string | null; }

/** Construção do `set` de um ON CONFLICT a partir das chaves do primeiro registro. */
function excludedSetFor(keys: string[]): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const key of keys) {
    const columnName = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    set[key] = sql.raw(`excluded."${columnName}"`);
  }
  return set;
}

/**
 * Repositório da sincronização assíncrona Meta (fluxo de dados v2).
 * Agregado: `meta_campaign_snapshots`, `meta_leads`, `meta_instagram_media`,
 * `meta_sync_runs` + espelho local `campaigns` (metrics/lastSyncedAt). ADR-0001.
 *
 * Todo método é tenant-bound e os upserts são idempotentes (ON CONFLICT),
 * habilitando re-runs e múltiplos pods sem duplicação.
 */
export class MetaSyncRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb, private configuredScopeId?: string) {
    super(tenantId, db);
  }

  private async activeScopeId(): Promise<string> {
    if (this.configuredScopeId) return this.configuredScopeId;
    const scope = await this.db.query.metaSyncScopes.findFirst({ where: eq(metaSyncScopes.tenantId, this.tenantId) });
    if (!scope) throw new Error(`META_SYNC_SCOPE_NOT_FOUND:${this.tenantId}`);
    return scope.id;
  }

  async ensureScope(input: MetaSyncScopeInput): Promise<string> {
    const current = await this.db.query.metaSyncScopes.findFirst({ where: eq(metaSyncScopes.tenantId, this.tenantId) });
    const matches = current && current.connectionId === input.connectionId && current.metaUserId === input.metaUserId
      && current.adAccountId === input.adAccountId && current.instagramUserId === (input.instagramUserId ?? null);
    if (matches) { this.configuredScopeId = current.id; return current.id; }
    const [scope] = await this.db.transaction(async (tx) => {
      if (current) await tx.delete(metaSyncScopes).where(eq(metaSyncScopes.id, current.id));
      return tx.insert(metaSyncScopes).values({ tenantId: this.tenantId, ...input } as any).returning();
    });
    this.configuredScopeId = scope.id;
    return scope.id;
  }

  /**
   * Remove o estado inteiro sincronizado da Meta para o tenant.
   *
   * A conexão Meta é única por tenant e as tabelas sincronizadas não guardam
   * connectionId. Por isso a limpeza é tenant-wide. A exclusão de campaigns
   * também remove, via ON DELETE CASCADE, insights e resultados de automação
   * ligados às campanhas.
   */
  async deleteAllMetaSyncedData(): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(metaLeads).where(eq(metaLeads.tenantId, this.tenantId));
      await tx.delete(metaCampaignDailyInsights).where(eq(metaCampaignDailyInsights.tenantId, this.tenantId));
      await tx.delete(metaInstagramMedia).where(eq(metaInstagramMedia.tenantId, this.tenantId));
      await tx.delete(metaSyncRuns).where(eq(metaSyncRuns.tenantId, this.tenantId));
      await tx.delete(campaigns).where(eq(campaigns.tenantId, this.tenantId));
      await tx.delete(metaCampaignSnapshots).where(eq(metaCampaignSnapshots.tenantId, this.tenantId));
    });
  }

  /** Upsert idempotente de um snapshot de campanha (ON CONFLICT tenant+campaign). */
  async upsertCampaignSnapshot(values: CampaignSnapshotUpsert): Promise<CampaignSnapshot> {
    const scopeId = await this.activeScopeId();
    const keys = Object.keys(values);
    const [row] = await this.db
      .insert(metaCampaignSnapshots)
      .values({ ...values, tenantId: this.tenantId, scopeId } as any)
      .onConflictDoUpdate({
        target: [metaCampaignSnapshots.tenantId, metaCampaignSnapshots.metaCampaignId],
        set: { ...excludedSetFor(keys), updatedAt: sql`now()` } as any,
        where: eq(metaCampaignSnapshots.scopeId, scopeId),
      })
      .returning();
    return row as CampaignSnapshot;
  }

  /** Upsert em lote de snapshots (idempotente). */
  async upsertCampaignSnapshots(values: CampaignSnapshotUpsert[]): Promise<void> {
    if (values.length === 0) return;
    const scopeId = await this.activeScopeId();
    const keys = Object.keys(values[0]);
    await this.db
      .insert(metaCampaignSnapshots)
      .values(values.map((v) => ({ ...v, tenantId: this.tenantId, scopeId })) as any)
      .onConflictDoUpdate({
        target: [metaCampaignSnapshots.tenantId, metaCampaignSnapshots.metaCampaignId],
        set: { ...excludedSetFor(keys), updatedAt: sql`now()` } as any,
        where: eq(metaCampaignSnapshots.scopeId, scopeId),
      });
  }

  /** Atualiza somente os campos informados, preservando métricas e insights já persistidos. */
  async updateCampaignSnapshot(
    metaCampaignId: string,
    values: Partial<Omit<CampaignSnapshotUpsert, 'metaCampaignId'>>
  ): Promise<void> {
    if (Object.keys(values).length === 0) return;
    const scopeId = await this.activeScopeId();
    await this.db
      .update(metaCampaignSnapshots)
      .set({ ...values, updatedAt: new Date() } as any)
      .where(and(
        eq(metaCampaignSnapshots.tenantId, this.tenantId),
        eq(metaCampaignSnapshots.metaCampaignId, metaCampaignId),
        eq(metaCampaignSnapshots.scopeId, scopeId)
      ));
  }

  /** Marca o resultado de `campaignHasLeadForm` no snapshot (evita N+1 nos ciclos seguintes). */
  async updateSnapshotHasLeadForm(metaCampaignId: string, hasLeadForm: boolean): Promise<void> {
    const scopeId = await this.activeScopeId();
    await this.db
      .update(metaCampaignSnapshots)
      .set({ hasLeadForm, updatedAt: new Date() })
      .where(
        and(
          eq(metaCampaignSnapshots.tenantId, this.tenantId),
          eq(metaCampaignSnapshots.metaCampaignId, metaCampaignId),
          eq(metaCampaignSnapshots.scopeId, scopeId)
        )
      );
  }

  /** Atualiza metrics + lastInsightsAt de um snapshot (após insights account-level). */
  async updateSnapshotMetrics(metaCampaignId: string, metrics: unknown): Promise<void> {
    const scopeId = await this.activeScopeId();
    await this.db
      .update(metaCampaignSnapshots)
      .set({ metrics: metrics as any, lastInsightsAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(metaCampaignSnapshots.tenantId, this.tenantId),
          eq(metaCampaignSnapshots.metaCampaignId, metaCampaignId),
          eq(metaCampaignSnapshots.scopeId, scopeId)
        )
      );
  }

  async markCampaignInsightsFetched(metaCampaignId: string): Promise<void> {
    const scopeId = await this.activeScopeId();
    await this.db.update(metaCampaignSnapshots)
      .set({ lastInsightsAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(metaCampaignSnapshots.tenantId, this.tenantId),
        eq(metaCampaignSnapshots.metaCampaignId, metaCampaignId),
        eq(metaCampaignSnapshots.scopeId, scopeId),
      ));
  }

  async upsertCampaignDailyInsights(values: CampaignDailyInsightUpsert[]): Promise<void> {
    if (values.length === 0) return;
    const scopeId = await this.activeScopeId();
    const keys = Object.keys(values[0]);
    await this.db.insert(metaCampaignDailyInsights)
      .values(values.map((value) => ({ ...value, tenantId: this.tenantId, scopeId })) as any)
      .onConflictDoUpdate({
        target: [metaCampaignDailyInsights.tenantId, metaCampaignDailyInsights.metaCampaignId, metaCampaignDailyInsights.date],
        set: { ...excludedSetFor(keys), updatedAt: sql`now()` } as any,
        where: eq(metaCampaignDailyInsights.scopeId, scopeId),
      });
  }

  async findCampaignDailyInsights(opts: { startDate: string; endDate: string }): Promise<CampaignDailyInsight[]> {
    return this.db.query.metaCampaignDailyInsights.findMany({
      where: and(
        eq(metaCampaignDailyInsights.tenantId, this.tenantId),
        gte(metaCampaignDailyInsights.date, opts.startDate),
        lte(metaCampaignDailyInsights.date, opts.endDate),
      ),
      orderBy: [metaCampaignDailyInsights.date],
    });
  }

  /** Upsert em lote de leads (ON CONFLICT tenant+lead — dedupe 6h/lead). */
  async upsertLeads(values: MetaLeadUpsert[]): Promise<void> {
    if (values.length === 0) return;
    const scopeId = await this.activeScopeId();
    const keys = Object.keys(values[0]);
    await this.db
      .insert(metaLeads)
      .values(values.map((v) => ({ ...v, tenantId: this.tenantId, scopeId })) as any)
      .onConflictDoUpdate({
        target: [metaLeads.tenantId, metaLeads.metaLeadId],
        // FEAT status de clientes: NUNCA incluir `status`/`statusUpdatedAt` aqui —
        // o sync não pode sobrescrever a alteração manual de status do usuário.
        set: excludedSetFor(keys) as any,
        where: eq(metaLeads.scopeId, scopeId),
      });
  }

  /** Alteração manual de status de um lead (transições livres), tenant-bound. */
  async updateLeadStatus(leadId: string, status: string): Promise<boolean> {
    const rows = await this.db
      .update(metaLeads)
      .set({ status: status as any, statusUpdatedAt: new Date() })
      .where(
        and(eq(metaLeads.tenantId, this.tenantId), eq(metaLeads.id, leadId))
      )
      .returning({ id: metaLeads.id });
    return rows.length > 0;
  }

  /**
   * Regra automática do FEAT status de clientes: leads com status `novo` e
   * criados antes do cutoff (2º dia sem alteração) viram `não contatado`.
   * Tenant-bound; retorna quantos leads foram atualizados.
   */
  async markStaleNewLeadsAsNotContacted(cutoff: Date): Promise<number> {
    const filters = and(
      eq(metaLeads.tenantId, this.tenantId),
      eq(metaLeads.status, 'novo'),
      lte(metaLeads.createdTime, cutoff)
    );
    const changed = await this.db.$count(metaLeads, filters);
    if (changed === 0) return 0;

    await this.db
      .update(metaLeads)
      .set({ status: 'não contatado' as any, statusUpdatedAt: new Date() })
      .where(filters);
    return changed;
  }

  /** Upsert em lote de mídia Instagram (ON CONFLICT tenant+media). */
  async upsertInstagramMedia(values: InstagramMediaUpsert[]): Promise<void> {
    if (values.length === 0) return;
    const scopeId = await this.activeScopeId();
    const keys = Object.keys(values[0]);
    await this.db
      .insert(metaInstagramMedia)
      .values(values.map((v) => ({ ...v, tenantId: this.tenantId, scopeId })) as any)
      .onConflictDoUpdate({
        target: [metaInstagramMedia.tenantId, metaInstagramMedia.mediaId],
        set: { ...excludedSetFor(keys), fetchedAt: sql`now()` } as any,
        where: eq(metaInstagramMedia.scopeId, scopeId),
      });
  }

  /** Persiste o resultado de um run de sincronização. */
  async recordSyncRun(input: RecordSyncRunInput): Promise<SyncRun> {
    const scope = await this.db.query.metaSyncScopes.findFirst({ where: eq(metaSyncScopes.tenantId, this.tenantId) });
    const [row] = await this.db
      .insert(metaSyncRuns)
      .values({
        tenantId: this.tenantId,
        scopeId: this.configuredScopeId ?? scope?.id ?? null,
        status: input.status,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        partialFailures: (input.partialFailures as any) ?? [],
        campaignsCount: input.campaignsCount ?? 0,
        leadsCount: input.leadsCount ?? 0,
        insightsCount: input.insightsCount ?? 0,
      } as any)
      .returning();
    return row as SyncRun;
  }

  /** Lista snapshots com paginação (filtro opcional por status). */
  async findCampaignSnapshots(opts: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: CampaignSnapshot[]; total: number }> {
    const filters: SQL[] = [eq(metaCampaignSnapshots.tenantId, this.tenantId)];
    if (opts.status) filters.push(eq(metaCampaignSnapshots.status, opts.status));

    const items = await this.db.query.metaCampaignSnapshots.findMany({
      where: and(...filters),
      limit: opts.limit ?? 50,
      offset: opts.offset ?? 0,
      orderBy: [desc(metaCampaignSnapshots.updatedAt)],
    });

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(metaCampaignSnapshots)
      .where(and(...filters));

    return { items, total: countRow?.count ?? 0 };
  }

  /** Snapshot por meta_campaign_id (escopado por tenant). */
  async findCampaignSnapshotByMetaId(metaCampaignId: string): Promise<CampaignSnapshot | null> {
    return (await this.db.query.metaCampaignSnapshots.findFirst({
      where: and(
        eq(metaCampaignSnapshots.tenantId, this.tenantId),
        eq(metaCampaignSnapshots.metaCampaignId, metaCampaignId)
      ),
    })) ?? null;
  }

  /** Leads de uma campanha (via snapshot ref) com paginação. */
  async findLeadsByCampaign(
    metaCampaignId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<{ items: MetaLead[]; total: number }> {
    const filters: SQL[] = [
      eq(metaLeads.tenantId, this.tenantId),
      eq(metaLeads.metaCampaignId, metaCampaignId),
    ];
    const items = await this.db.query.metaLeads.findMany({
      where: and(...filters),
      limit: opts.limit ?? 200,
      offset: opts.offset ?? 0,
      orderBy: [desc(metaLeads.createdTime)],
    });
    const [countRow] = await this.db.select({ count: sql<number>`count(*)::int` }).from(metaLeads).where(and(...filters));
    return { items, total: countRow?.count ?? 0 };
  }

  /** Todos os leads do tenant (paginação). */
  async findAllLeads(opts: { limit?: number; offset?: number } = {}): Promise<{ items: MetaLead[]; total: number }> {
    const filters: SQL[] = [eq(metaLeads.tenantId, this.tenantId)];
    const items = await this.db.query.metaLeads.findMany({
      where: and(...filters),
      limit: opts.limit ?? 200,
      offset: opts.offset ?? 0,
      orderBy: [desc(metaLeads.createdTime)],
    });
    const [countRow] = await this.db.select({ count: sql<number>`count(*)::int` }).from(metaLeads).where(and(...filters));
    return { items, total: countRow?.count ?? 0 };
  }

  /**
   * Contagem de envios de formulário por campanha (fonte do número "Clientes").
   * Contrato COMPLETO: campanhas sem lead aparecem com 0 — o caller não deve
   * tratar ausência como "sem dado" nem cair em outro fallback.
   */
  async countLeadsByCampaign(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        metaCampaignId: metaLeads.metaCampaignId,
        count: sql<number>`count(*)::int`,
      })
      .from(metaLeads)
      .where(eq(metaLeads.tenantId, this.tenantId))
      .groupBy(metaLeads.metaCampaignId);

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.metaCampaignId) counts.set(row.metaCampaignId, Number(row.count) || 0);
    }
    return counts;
  }

  /** Campanhas de formulário (OUTCOME_LEADS com form) — filtro da página de Leads. */
  async findLeadCampaigns(): Promise<Array<{
    metaCampaignId: string;
    name: string;
    objective: string | null;
      hasLeadForm: boolean | null;
  }>> {
    const rows = await this.db.query.metaCampaignSnapshots.findMany({
      where: and(
        eq(metaCampaignSnapshots.tenantId, this.tenantId),
        eq(metaCampaignSnapshots.objective, 'OUTCOME_LEADS'),
        eq(metaCampaignSnapshots.hasLeadForm, true)
      ),
      orderBy: [desc(metaCampaignSnapshots.updatedAt)],
    });
    return rows.map((r) => ({
      metaCampaignId: r.metaCampaignId,
      name: r.name,
      objective: r.objective,
      hasLeadForm: r.hasLeadForm === true,
    }));
  }

  /** Mídia Instagram persistida do tenant. */
  async findInstagramInsights(): Promise<InstagramMedia[]> {
    return this.db.query.metaInstagramMedia.findMany({
      where: eq(metaInstagramMedia.tenantId, this.tenantId),
      orderBy: [desc(metaInstagramMedia.timestamp)],
    });
  }

  /** Run de sucesso mais recente (para o cálculo de staleness do fallback). */
  async lastSuccessfulRun(): Promise<SyncRun | null> {
    return (await this.db.query.metaSyncRuns.findFirst({
      where: and(eq(metaSyncRuns.tenantId, this.tenantId), inArray(metaSyncRuns.status, ['success', 'partial'])),
      orderBy: [desc(metaSyncRuns.startedAt)],
    })) ?? null;
  }

  /** Mapa metaCampaignId → budget.lead_form_id das campanhas locais do Fury (evita N+1 no 1º ciclo). */
  async findLocalLeadFormByMetaIds(metaCampaignIds: string[]): Promise<Map<string, string | null>> {
    if (metaCampaignIds.length === 0) return new Map();
    const rows = await this.db
      .select({ metaCampaignId: campaigns.metaCampaignId, budget: campaigns.budget })
      .from(campaigns)
      .where(
        and(eq(campaigns.tenantId, this.tenantId), inArray(campaigns.metaCampaignId, metaCampaignIds))
      );
    const map = new Map<string, string | null>();
    for (const row of rows) {
      const budget = (row.budget as Record<string, unknown> | null) ?? {};
      const formId = typeof budget.lead_form_id === 'string' ? budget.lead_form_id : null;
      map.set(row.metaCampaignId, formId);
    }
    return map;
  }

  /** Espelho local: grava metrics + lastSyncedAt na tabela `campaigns` do Fury. */
  async updateLocalCampaignMetrics(
    metaCampaignId: string,
    metrics: unknown
  ): Promise<void> {
    await this.db
      .update(campaigns)
      .set({ metrics: metrics as any, lastSyncedAt: new Date() })
      .where(
        and(eq(campaigns.tenantId, this.tenantId), eq(campaigns.metaCampaignId, metaCampaignId))
      );
  }
}
