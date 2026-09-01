import {
  db as defaultDb,
  type Database,
  creativeAssets,
} from '@fury/db';
import { and, count, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type CreativeAsset = typeof creativeAssets.$inferSelect;

export interface ListAssetsFilter {
  type?: 'image' | 'video' | 'copy';
  status?: 'pending' | 'approved' | 'rejected';
  page: number;
  limit: number;
}

/**
 * Repositório do domínio **Studio / Creative Assets**.
 * Agregado: `creativeAssets`. ADR-0001.
 *
 * Os `socialPosts` do fluxo planner→studio são delegados ao `PlannerRepository`
 * (dono único daquele agregado) — ver studio.service.
 * Todo método é escopado pelo `tenantId` do construtor.
 */
export class StudioRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  async createAsset(data: Partial<CreativeAsset>): Promise<CreativeAsset> {
    const [row] = await this.db.insert(creativeAssets).values(data as any).returning();
    return row;
  }

  async deleteAsset(id: string): Promise<void> {
    await this.db.delete(creativeAssets).where(and(eq(creativeAssets.id, id), eq(creativeAssets.tenantId, this.tenantId)));
  }

  async deleteAssetAndChildren(id: string): Promise<void> {
    // Deleta filhos (que apontam para este asset como rootAssetId) primeiro,
    // depois deleta o próprio asset. A FK rootAssetId não tem ON DELETE CASCADE.
    await this.db.delete(creativeAssets).where(
      and(
        eq(creativeAssets.rootAssetId, id),
        eq(creativeAssets.tenantId, this.tenantId),
      ),
    );
    await this.db.delete(creativeAssets).where(
      and(eq(creativeAssets.id, id), eq(creativeAssets.tenantId, this.tenantId)),
    );
  }

  async patchAsset(id: string, data: Partial<CreativeAsset>) {
    const [row] = await this.db
      .update(creativeAssets)
      .set(data as any)
      .where(and(eq(creativeAssets.id, id), eq(creativeAssets.tenantId, this.tenantId)))
      .returning();
    return row ?? null;
  }

  async findAssetById(id: string) {
    return this.db.query.creativeAssets.findFirst({
      where: and(eq(creativeAssets.id, id), eq(creativeAssets.tenantId, this.tenantId)),
    });
  }

  async findAssetByUrl(url: string) {
    return this.db.query.creativeAssets.findFirst({
      where: and(eq(creativeAssets.tenantId, this.tenantId), eq(creativeAssets.url, url)),
    });
  }

  /**
   * Listagem paginada dos assets do tenant + total + resolução em lote de
   * modificationsRemaining pela raiz da linhagem (evita N+1).
   */
  async listAssets(filter: ListAssetsFilter) {
    const { type, status, page, limit } = filter;
    const offset = (page - 1) * limit;

    const clauses: SQL[] = [eq(creativeAssets.tenantId, this.tenantId)];
    if (type) clauses.push(eq(creativeAssets.type, type));
    if (status === 'pending') {
      clauses.push(
        or(
          eq(creativeAssets.complianceStatus, 'pending'),
          eq(creativeAssets.complianceStatus, 'pending_compliance'),
        )!,
      );
    } else if (status) {
      clauses.push(eq(creativeAssets.complianceStatus, status));
    }
    const whereClause = and(...clauses);

    const [countRow] = await this.db
      .select({ total: count() })
      .from(creativeAssets)
      .where(whereClause);

    const rows = await this.db.query.creativeAssets.findMany({
      where: whereClause,
      orderBy: [desc(creativeAssets.createdAt)],
      limit,
      offset,
    });

    const rootIds = Array.from(new Set(rows.map((r: any) => r.rootAssetId ?? r.id)));
    const rootRows = rootIds.length
      ? await this.db.query.creativeAssets.findMany({
          where: inArray(creativeAssets.id, rootIds),
          columns: { id: true, modificationsRemaining: true },
        })
      : [];
    const modificationsRemainingByRootId = new Map(rootRows.map((r) => [r.id, r.modificationsRemaining]));

    return {
      rows,
      total: Number((countRow as any)?.total ?? 0),
      modificationsRemainingByRootId,
    };
  }
}