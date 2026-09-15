import {
  db as defaultDb,
  type Database,
  creativeAssets,
} from '@fury/db';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, count, desc, eq, isNull, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type CreativeAsset = typeof creativeAssets.$inferSelect;

export interface ListAssetsFilter {
  type?: 'image' | 'video' | 'copy';
  status?: 'pending' | 'approved' | 'rejected';
  /** false (padrão) = grupos ativos; true = grupos arquivados. */
  archived?: boolean;
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
    // Desvincula os filhos (rootAssetId -> null) antes de deletar o pai,
    // para evitar violação de FK (rootAssetId references creativeAssets.id
    // sem ON DELETE SET NULL). Cada versão vive independentemente.
    await this.db
      .update(creativeAssets)
      .set({ rootAssetId: null })
      .where(and(eq(creativeAssets.rootAssetId, id), eq(creativeAssets.tenantId, this.tenantId)));

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
   * Todas as versões de um grupo (a raiz + cada modificação), ordenadas por
   * criação. `rootId` é sempre o id da raiz (rootAssetId IS NULL) — quem
   * chama já resolveu isso via `asset.rootAssetId ?? asset.id`.
   */
  async findGroupVersions(rootId: string): Promise<CreativeAsset[]> {
    return this.db.query.creativeAssets.findMany({
      where: and(
        eq(creativeAssets.tenantId, this.tenantId),
        or(eq(creativeAssets.id, rootId), eq(creativeAssets.rootAssetId, rootId))!,
      ),
      orderBy: [asc(creativeAssets.createdAt)],
    });
  }

  /** Marca `activeAssetId` na raiz do grupo — "versão em evidência". */
  async setActiveAsset(rootId: string, activeAssetId: string): Promise<CreativeAsset | null> {
    const [row] = await this.db
      .update(creativeAssets)
      .set({ activeAssetId })
      .where(and(eq(creativeAssets.id, rootId), eq(creativeAssets.tenantId, this.tenantId)))
      .returning();
    return row ?? null;
  }

  /**
   * Listagem paginada de GRUPOS (1 linha por linhagem: raiz + modificações),
   * não 1 linha por versão. Cada grupo é representado pela versão "em
   * evidência" (root.activeAssetId ?? root.id), via self-join.
   *
   * `status` filtra pela versão em EVIDÊNCIA (não pela raiz) — por isso
   * precisa de um join de verdade, e não do antigo padrão de "segundo SELECT
   * em lote" (que só servia pra um campo aditivo/não-filtrável,
   * modificationsRemaining — que aqui já sai resolvido no mesmo join).
   * `type` filtra pela raiz — invariante do domínio: o tipo não muda dentro
   * de um grupo em nenhum fluxo de modificação hoje.
   */
  async listAssets(filter: ListAssetsFilter) {
    const { type, status, archived = false, page, limit } = filter;
    const offset = (page - 1) * limit;

    const root = alias(creativeAssets, 'root');
    const display = alias(creativeAssets, 'display');

    const clauses: SQL[] = [
      eq(root.tenantId, this.tenantId),
      isNull(root.rootAssetId),
      archived ? isNotNull(root.archivedAt) : isNull(root.archivedAt),
    ];
    if (type) clauses.push(eq(root.type, type));
    if (status === 'pending') {
      clauses.push(
        or(
          eq(display.complianceStatus, 'pending'),
          eq(display.complianceStatus, 'pending_compliance'),
        )!,
      );
    } else if (status) {
      clauses.push(eq(display.complianceStatus, status));
    }
    const whereClause = and(...clauses);
    const joinCondition = eq(display.id, sql`coalesce(${root.activeAssetId}, ${root.id})`);

    const [countRow] = await this.db
      .select({ total: count() })
      .from(root)
      .innerJoin(display, joinCondition)
      .where(whereClause);

    const rows = await this.db
      .select({
        id: display.id,
        type: display.type,
        url: display.url,
        metaAssetId: display.metaAssetId,
        complianceStatus: display.complianceStatus,
        complianceNotes: display.complianceNotes,
        createdAt: display.createdAt,
        groupId: root.id,
        modificationsRemaining: root.modificationsRemaining,
        archivedAt: root.archivedAt,
      })
      .from(root)
      .innerJoin(display, joinCondition)
      .where(whereClause)
      .orderBy(desc(root.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      rows,
      total: Number((countRow as any)?.total ?? 0),
    };
  }
}