import { db as defaultDb, type Database, users, tenants, adyRbacServicesBlocked, adyRbacViewsBlocked } from '@fury/db';
import { and, eq, isNull, or } from 'drizzle-orm';

export interface RbacUserContext {
  platformRole: string;
  partnerId: string | null;
}

export class RbacRepository {
  constructor(private db: Database = defaultDb) {}

  // partner vem do usuário (admin_partner) ou do tenant (user_partner); excluído = null
  async findUserContext(userId: string): Promise<RbacUserContext | null> {
    const [row] = await this.db
      .select({
        platformRole: users.platformRole,
        userPartnerId: users.partnerId,
        tenantPartnerId: tenants.partnerId,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(and(eq(users.id, userId), isNull(users.deletedAt), isNull(tenants.deletedAt)))
      .limit(1);
    if (!row) return null;
    return { platformRole: row.platformRole, partnerId: row.userPartnerId ?? row.tenantPartnerId ?? null };
  }

  async listBlockedServiceKeys(roleKey: string, partnerId: string | null): Promise<string[]> {
    const t = adyRbacServicesBlocked;
    const rows = await this.db
      .select({ key: t.serviceKey })
      .from(t)
      .where(and(eq(t.roleKey, roleKey), partnerId ? or(isNull(t.partnerId), eq(t.partnerId, partnerId)) : isNull(t.partnerId)));
    return rows.map((r) => r.key);
  }

  async listBlockedViewKeys(roleKey: string, partnerId: string | null): Promise<string[]> {
    const t = adyRbacViewsBlocked;
    const rows = await this.db
      .select({ key: t.viewKey })
      .from(t)
      .where(and(eq(t.roleKey, roleKey), partnerId ? or(isNull(t.partnerId), eq(t.partnerId, partnerId)) : isNull(t.partnerId)));
    return rows.map((r) => r.key);
  }
}
