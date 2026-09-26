import {
  db as defaultDb,
  type Database,
  metaCampaignSnapshots,
  metaLeads,
  metaInstagramMedia,
  metaSyncRuns,
  campaigns,
} from '@fury/db';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type CampaignSnapshot = typeof metaCampaignSnapshots.$inferSelect;
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

/** Construção do `set` de um ON CONFLICT a partir das chaves do primeiro registro. */
function excludedSetFor(keys: string[]): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const key of keys) {
    set[key] = sql.raw(`excluded."${key}"`);
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
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  /** Upsert idempotente de um snapshot de campanha (ON CONFLICT tenant+campaign). */
  async upsertCampaignSnapshot(values: CampaignSnapshotUpsert): Promise<CampaignSnapshot> {
    const keys = Object.keys(values);
    const [row] = await this.db
      .insert(metaCampaignSnapshots)
      .values({ ...values, tenantId: this.tenantId } as any)
      .onConflictDoUpdate({
        target: [metaCampaignSnapshots.tenantId, metaCampaignSnapshots.metaCampaignId],
        set: { ...excludedSetFor(keys), updatedAt: sql`now()` } as any,
      })
      .returning();
    return row as CampaignSnapshot;
  }

  /** Upsert em lote de snapshots (idempotente). */
  async upsertCampaignSnapshots(values: CampaignSnapshotUpsert[]): Promise<void> {
    if (values.length === 0) return;
    const keys = Object.keys(values[0]);
    await this.db
      .insert(metaCampaignSnapshots)
      .values(values.map((v) => ({ ...v, tenantId: this.tenantId })) as any)
      .onConflictDoUpdate({
        target: [metaCampaignSnapshots.tenantId, metaCampaignSnapshots.metaCampaignId],
        set: { ...excludedSetFor(keys), updatedAt: sql`now()` } as any,
      });
  }

  /** Marca o resultado de `campaignHasLeadForm` no snapshot (evita N+1 nos ciclos seguintes). */
  async updateSnapshotHasLeadForm(metaCampaignId: string, hasLeadForm: boolean): Promise<void> {
    await this.db
      .update(metaCampaignSnapshots)
      .set({ hasLeadForm, updatedAt: new Date() })
      .where(
        and(
          eq(metaCampaignSnapshots.tenantId, this.tenantId),
          eq(metaCampaignSnapshots.metaCampaignId, metaCampaignId)
        )
      );
  }

  /** Upsert em lote de leads (ON CONFLICT tenant+lead — dedupe 6h/lead). */
  async upsertLeads(values: MetaLeadUpsert[]): Promise<void> {
    if (values.length === 0) return;
    const keys = Object.keys(values[0]);
    await this.db
      .insert(metaLeads)
      .values(values.map((v) => ({ ...v, tenantId: this.tenantId })) as any)
      .onConflictDoUpdate({
        target: [metaLeads.tenantId, metaLeads.metaLeadId],
        set: excludedSetFor(keys) as any,
      });
  }

  /** Upsert em lote de mídia Instagram (ON CONFLICT tenant+media). */
  async upsertInstagramMedia(values: InstagramMediaUpsert[]): Promise<void> {
    if (values.length === 0) return;
    const keys = Object.keys(values[0]);
    await this.db
      .insert(metaInstagramMedia)
      .values(values.map((v) => ({ ...v, tenantId: this.tenantId })) as any)
      .onConflictDoUpdate({
        target: [metaInstagramMedia.tenantId, metaInstagramMedia.mediaId],
        set: { ...excludedSetFor(keys), fetchedAt: sql`now()` } as any,
      });
  }

  /** Persiste o resultado de um run de sincronização. */
  async recordSyncRun(input: RecordSyncRunInput): Promise<SyncRun> {
    const [row] = await this.db
      .insert(metaSyncRuns)
      .values({
        tenantId: this.tenantId,
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

  /** Campanhas de formulário (OUTCOME_LEADS com form) — filtro da página de Leads. */
  async findLeadCampaigns(): Promise<Array<{
    metaCampaignId: string;
    name: string;
    objective: string | null;
    hasLeadForm: boolean;
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
      hasLeadForm: r.hasLeadForm,
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
      where: and(eq(metaSyncRuns.tenantId, this.tenantId), eq(metaSyncRuns.status, 'success')),
      orderBy: [desc(metaSyncRuns.startedAt)],
    })) ?? null;
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