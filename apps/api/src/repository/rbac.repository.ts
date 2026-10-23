import { db as defaultDb, type Database, users, tenants, adyRbacServicesBlocked } from '@fury/db';
import { and, eq, isNull, or } from 'drizzle-orm';

export interface RbacUserContext {
  platformRole: string;
  partnerId: string | null;
}

export class RbacRepository {
  constructor(private db: Database = defaultDb) {}

  // partner vem do usuário (admin_partner) ou do tenant (user_partner)
  async findUserContext(userId: string): Promise<RbacUserContext | null> {
    const [row] = await this.db
      .select({
        platformRole: users.platformRole,
        userPartnerId: users.partnerId,
        tenantPartnerId: tenants.partnerId,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) return null;
    return { platformRole: row.platformRole, partnerId: row.userPartnerId ?? row.tenantPartnerId ?? null };
  }

  async listBlockedServiceKeys(roleKey: string, partnerId: string | null): Promise<string[]> {
    const partnerFilter = partnerId
      ? or(isNull(adyRbacServicesBlocked.partnerId), eq(adyRbacServicesBlocked.partnerId, partnerId))
      : isNull(adyRbacServicesBlocked.partnerId);
    const rows = await this.db
      .select({ serviceKey: adyRbacServicesBlocked.serviceKey })
      .from(adyRbacServicesBlocked)
      .where(and(eq(adyRbacServicesBlocked.roleKey, roleKey), partnerFilter));
    return rows.map((r) => r.serviceKey);
  }
}
