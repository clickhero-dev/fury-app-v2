import {
  db as defaultDb,
  type Database,
  brandKits,
  clientGoals,
  metaConnections,
  tenants,
  users,
  businessProfileSettings,
} from '@fury/db';
import { eq } from 'drizzle-orm';

/**
 * Base de todos os repositórios tenant-scoped.
 *
 * O construtor já carrega `tenantId` (e `db`, com default) — os métodos não
 * recebem tenantId como parâmetro, pois o escopo é resolvido aqui.
 *
 * Hospeda as **lookups compartilhadas** (lidas por vários domínios):
 * tenant, brand kit, client goal, conexão Meta, perfil de negócio e usuário.
 * ADR-0001.
 */
export abstract class TenantScopedRepository {
  constructor(
    protected readonly tenantId: string,
    protected readonly db: Database = defaultDb,
  ) {}

  async findTenant() {
    return this.db.query.tenants.findFirst({ where: eq(tenants.id, this.tenantId) });
  }

  async findBrandKit() {
    return this.db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, this.tenantId) });
  }

  /** Upsert brandKit do tenant (insert onConflictDoUpdate por tenantId). */
  async upsertTenantBrandKit(values: Partial<typeof brandKits.$inferInsert>) {
    const [row] = await this.db
      .insert(brandKits)
      .values({ tenantId: this.tenantId, ...values } as any)
      .onConflictDoUpdate({
        target: brandKits.tenantId,
        set: { ...values, updatedAt: new Date() } as any,
      })
      .returning();
    return row;
  }

  /** Atualiza brandKit do tenant (indiferente se não existir). */
  async updateTenantBrandKit(values: Partial<typeof brandKits.$inferInsert>) {
    await this.db
      .update(brandKits)
      .set(values as any)
      .where(eq(brandKits.tenantId, this.tenantId));
  }

  async findClientGoal() {
    return this.db.query.clientGoals.findFirst({ where: eq(clientGoals.tenantId, this.tenantId) });
  }

  /** Insere clientGoal do tenant (apenas quando não há). Tenant-scoped — difere do GLOBAL do superadmin. */
  async createTenantClientGoal(data: Partial<typeof clientGoals.$inferInsert>) {
    const [row] = await this.db
      .insert(clientGoals)
      .values({ ...data, tenantId: this.tenantId } as any)
      .returning();
    return row;
  }

  /** Atualiza clientGoal do tenant (se não houver, retorna null). Tenant-scoped. */
  async updateTenantClientGoal(data: Partial<typeof clientGoals.$inferInsert>) {
    const [row] = await this.db
      .update(clientGoals)
      .set(data as any)
      .where(eq(clientGoals.tenantId, this.tenantId))
      .returning();
    return row ?? null;
  }

  /** Upsert de clientGoal do tenant (update na existente, insert se não há). */
  async upsertTenantClientGoal(data: Partial<typeof clientGoals.$inferInsert>) {
    const existing = await this.findClientGoal();
    if (existing) return this.updateTenantClientGoal({ ...data, updatedAt: new Date() });
    return this.createTenantClientGoal({ ...data, createdAt: new Date() });
  }

  async findBusinessProfile() {
    return this.db.query.businessProfileSettings.findFirst({
      where: eq(businessProfileSettings.tenantId, this.tenantId),
    });
  }

  async findUserByTenant() {
    return this.db.query.users.findFirst({ where: eq(users.tenantId, this.tenantId) });
  }

  /** Emails dos usuários do tenant (dono/equipe). Usado em notificações transacionais. */
  async findUserEmailsByTenant(): Promise<string[]> {
    const rows = await this.db.query.users.findMany({ where: eq(users.tenantId, this.tenantId) });
    return rows
      .map((row) => row.email)
      .filter((email): email is string => Boolean(email));
  }

  /** Conexão Meta atual do tenant (qualquer estado). */
  async findMetaConnection() {
    return this.db.query.metaConnections.findFirst({
      where: eq(metaConnections.tenantId, this.tenantId),
    });
  }

  /** Conexão Meta mais recente do tenant (por createdAt desc). Reuso: planner, studio. */
  async findLatestMetaConnection() {
    return this.db.query.metaConnections.findFirst({
      where: eq(metaConnections.tenantId, this.tenantId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });
  }
}