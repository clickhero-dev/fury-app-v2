import { db as defaultDb, type Database, brandKitPhotos } from '@fury/db';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

export type BrandKitPhoto = typeof brandKitPhotos.$inferSelect;
export type BrandKitPhotoKind = BrandKitPhoto['kind'];

/**
 * Repositório da **biblioteca de imagens do Estúdio** (tenant-bound).
 * Toda leitura/escrita filtra por tenant — o tipo da imagem só é gravado aqui.
 * Soft delete: leituras ignoram linhas com `deletedAt`; nenhuma linha é apagada.
 */
export class BrandKitPhotoRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  private active() {
    return and(eq(brandKitPhotos.tenantId, this.tenantId), isNull(brandKitPhotos.deletedAt));
  }

  async list(kind?: BrandKitPhotoKind): Promise<BrandKitPhoto[]> {
    return this.db.query.brandKitPhotos.findMany({
      where: kind ? and(this.active(), eq(brandKitPhotos.kind, kind)) : this.active(),
      orderBy: [desc(brandKitPhotos.createdAt)],
    });
  }

  async findById(id: string): Promise<BrandKitPhoto | undefined> {
    return this.db.query.brandKitPhotos.findFirst({
      where: and(eq(brandKitPhotos.id, id), this.active()),
    });
  }

  async findByIds(ids: string[]): Promise<BrandKitPhoto[]> {
    if (ids.length === 0) return [];
    return this.db.query.brandKitPhotos.findMany({
      where: and(inArray(brandKitPhotos.id, ids), this.active()),
    });
  }

  async create(data: { brandKitId: string; kind: BrandKitPhotoKind; url: string }): Promise<BrandKitPhoto> {
    const [row] = await this.db
      .insert(brandKitPhotos)
      .values({ tenantId: this.tenantId, ...data })
      .returning();
    return row;
  }

  /** Soft delete; devolve a linha (undefined se não for do tenant ou já removida). */
  async softDeleteById(id: string): Promise<BrandKitPhoto | undefined> {
    const [row] = await this.db
      .update(brandKitPhotos)
      .set({ deletedAt: new Date() })
      .where(and(eq(brandKitPhotos.id, id), this.active()))
      .returning();
    return row;
  }
}
