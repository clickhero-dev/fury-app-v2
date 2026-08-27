import {
  db as defaultDb,
  type Database,
  metaConnections,
} from '@fury/db';
import { and, eq } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type MetaConnection = typeof metaConnections.$inferSelect;

/**
 * Repositório do domínio **Meta / conexões Facebook Ads**.
 * Agregado: `metaConnections`. ADR-0001.
 *
 * `findLatestMetaConnection` (conexão canônica por createdAt desc) vem da base —
 * é o padrão dominante nas funções do fluxo Meta. Aqui vivem as operações de
 * escrita e as buscas por chave. Todo método é escopado pelo `tenantId`.
 */
export class MetaRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  async findMetaConnectionById(id: string) {
    return this.db.query.metaConnections.findFirst({
      where: and(eq(metaConnections.id, id), eq(metaConnections.tenantId, this.tenantId)),
    });
  }

  async findMetaConnectionByMetaUserId(metaUserId: string) {
    return this.db.query.metaConnections.findFirst({
      where: and(eq(metaConnections.tenantId, this.tenantId), eq(metaConnections.metaUserId, metaUserId)),
    });
  }

  async createMetaConnection(data: Partial<MetaConnection>): Promise<MetaConnection> {
    const [row] = await this.db.insert(metaConnections).values(data as any).returning();
    return row;
  }

  async patchMetaConnection(id: string, data: Partial<MetaConnection>) {
    const [row] = await this.db
      .update(metaConnections)
      .set(data as any)
      .where(and(eq(metaConnections.id, id), eq(metaConnections.tenantId, this.tenantId)))
      .returning();
    return row ?? null;
  }

  async deleteMetaConnection(id: string): Promise<void> {
    await this.db.delete(metaConnections).where(and(eq(metaConnections.id, id), eq(metaConnections.tenantId, this.tenantId)));
  }
}