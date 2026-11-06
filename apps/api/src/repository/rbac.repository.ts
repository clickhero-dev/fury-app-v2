import { db as defaultDb, type Database, users, tenants, adyRbacServicesBlocked, adyRbacViewsBlocked, adyRbacAuditLog } from '@fury/db';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

export interface RbacUserContext {
  platformRole: string;
  partnerId: string | null;
}

export interface SetViewBlockedInput {
  roleKeys: string[];
  partnerId: string | null;
  viewKey: string;
  serviceKeys: string[];
  blocked: boolean;
  actorUserId: string;
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

  // só o escopo exato (sem somar o padrão), para a tela de permissões
  async listOwnBlockedViewKeys(roleKey: string, partnerId: string | null): Promise<string[]> {
    const t = adyRbacViewsBlocked;
    const rows = await this.db
      .select({ key: t.viewKey })
      .from(t)
      .where(and(eq(t.roleKey, roleKey), partnerId ? eq(t.partnerId, partnerId) : isNull(t.partnerId)));
    return rows.map((r) => r.key);
  }

  // tela + serviços dela + histórico, tudo ou nada; true = algo mudou
  async setViewBlocked(input: SetViewBlockedInput): Promise<boolean> {
    const { roleKeys, partnerId, viewKey, serviceKeys, blocked, actorUserId } = input;
    return this.db.transaction(async (tx) => {
      const v = adyRbacViewsBlocked;
      const s = adyRbacServicesBlocked;
      const scopeOf = (col: typeof v.partnerId | typeof s.partnerId) => (partnerId ? eq(col, partnerId) : isNull(col));
      let changed = false;

      if (blocked) {
        for (const roleKey of roleKeys) {
          const rows = await tx.insert(v).values({ roleKey, partnerId, viewKey, createdBy: actorUserId }).onConflictDoNothing().returning({ id: v.id });
          changed ||= rows.length > 0;
          for (const serviceKey of serviceKeys) {
            await tx.insert(s).values({ roleKey, partnerId, serviceKey, createdBy: actorUserId }).onConflictDoNothing();
          }
        }
      } else {
        const rows = await tx.delete(v).where(and(inArray(v.roleKey, roleKeys), scopeOf(v.partnerId), eq(v.viewKey, viewKey))).returning({ id: v.id });
        changed = rows.length > 0;
        if (serviceKeys.length)
          await tx.delete(s).where(and(inArray(s.roleKey, roleKeys), scopeOf(s.partnerId), inArray(s.serviceKey, serviceKeys)));
      }

      if (changed) {
        await tx.insert(adyRbacAuditLog).values({
          actorUserId,
          action: blocked ? 'view_blocked' : 'view_unblocked',
          entityType: 'view',
          entityKey: viewKey,
          roleKey: roleKeys.join(','),
          partnerId,
          details: { scope: partnerId ? 'partner' : 'default', services: serviceKeys, roles: roleKeys },
        });
      }
      return changed;
    });
  }
}
