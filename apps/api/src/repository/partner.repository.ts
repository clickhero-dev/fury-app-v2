import { db as defaultDb, type Database, adyPartners, tenants, users } from '@fury/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

export interface PartnerSummary {
  id: string;
  name: string;
  maxTenants: number;
  usedTenants: number;
  accountEmail: string | null;
  keyLast4: string | null;
  createdAt: Date;
}

export interface NewPartnerAccount {
  name: string;
  email: string;
  passwordHash: string;
}

/** Parceiros (GLOBAL, só super_admin). A conta do parceiro fica num cliente próprio, sem partner_id: não ocupa vaga. */
export class PartnerRepository {
  constructor(private db: Database = defaultDb) {}

  async list(): Promise<PartnerSummary[]> {
    const rows = await this.db
      .select({
        id: adyPartners.id,
        name: adyPartners.name,
        maxTenants: adyPartners.maxTenants,
        keyLast4: adyPartners.openrouterKeyLast4,
        createdAt: adyPartners.createdAt,
        // vagas: clientes do parceiro não excluídos
        usedTenants: sql<number>`(SELECT count(*)::int FROM tenants t WHERE t.partner_id = "ady_partners"."id" AND t.deleted_at IS NULL)`.mapWith(Number),
        accountEmail: sql<string | null>`(SELECT u.email FROM users u WHERE u.partner_id = "ady_partners"."id" AND u.platform_role = 'admin_partner' AND u.deleted_at IS NULL ORDER BY u.created_at LIMIT 1)`,
      })
      .from(adyPartners)
      .where(isNull(adyPartners.deletedAt))
      .orderBy(asc(adyPartners.name));
    return rows;
  }

  async findById(id: string): Promise<PartnerSummary | null> {
    return (await this.list()).find((p) => p.id === id) ?? null;
  }

  async update(id: string, data: { name?: string; maxTenants?: number }) {
    await this.db.update(adyPartners).set({ ...data, updatedAt: new Date() }).where(eq(adyPartners.id, id));
  }

  // empresa + cliente próprio + conta admin_partner, tudo ou nada
  async createWithAccount(name: string, maxTenants: number, slug: string, account: NewPartnerAccount) {
    return this.db.transaction(async (tx) => {
      const [partner] = await tx.insert(adyPartners).values({ name, maxTenants }).returning();
      const [tenant] = await tx.insert(tenants).values({ name, slug }).returning();
      const [user] = await tx
        .insert(users)
        .values({
          tenantId: tenant!.id,
          name: account.name,
          email: account.email,
          passwordHash: account.passwordHash,
          // cargo admin: cai na trava do login social por e-mail (como o super_admin)
          role: 'admin',
          platformRole: 'admin_partner',
          partnerId: partner!.id,
        })
        .returning({ id: users.id, email: users.email });
      return { partner: partner!, tenantId: tenant!.id, user: user! };
    });
  }

  async findTenantBySlug(slug: string) {
    return this.db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
  }

  // clientes excluídos (soft-delete), com o parceiro de cada um
  async listDeletedTenants() {
    return this.db
      .select({ id: tenants.id, name: tenants.name, deletedAt: tenants.deletedAt, partnerId: tenants.partnerId, partnerName: adyPartners.name })
      .from(tenants)
      .leftJoin(adyPartners, eq(adyPartners.id, tenants.partnerId))
      .where(sql`${tenants.deletedAt} IS NOT NULL`)
      .orderBy(sql`${tenants.deletedAt} DESC`);
  }

  async findDeletedTenant(id: string) {
    return this.db.query.tenants.findFirst({ where: and(eq(tenants.id, id), sql`${tenants.deletedAt} IS NOT NULL`) });
  }

  async restoreTenant(id: string) {
    await this.db.update(tenants).set({ deletedAt: null }).where(eq(tenants.id, id));
  }
}
