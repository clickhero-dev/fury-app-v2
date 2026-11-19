import { db as defaultDb, type Database, users, tenants, subscriptions, adyRbacServicesBlocked, adyRbacViewsBlocked, adyRbacPlanViewsBlocked, adyRbacAuditLog } from '@fury/db';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

export interface RbacUserContext {
  platformRole: string;
  partnerId: string | null;
  // cliente e cargo: base do bloqueio por plano
  tenantId?: string;
  role?: string;
  // usuário dentro da conta própria do parceiro: segue o plano do parceiro
  partnerAccount?: boolean;
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
        tenantId: users.tenantId,
        role: users.role,
        // parceiro do usuário ou do cliente, só se estiver vivo (excluído = sem parceiro = bloqueia tudo)
        livePartnerId: sql<string | null>`(SELECT p.id FROM ady_partners p WHERE p.deleted_at IS NULL
          AND p.id = coalesce("users"."partner_id", "tenants"."partner_id"))`,
        // parceiro dono da conta própria (cliente sem partner_id com admin_partner vivo)
        accountPartnerId: sql<string | null>`(SELECT u2.partner_id FROM users u2 JOIN ady_partners p2 ON p2.id = u2.partner_id AND p2.deleted_at IS NULL
          WHERE u2.tenant_id = "tenants"."id" AND "tenants"."partner_id" IS NULL AND u2.platform_role = 'admin_partner' AND u2.deleted_at IS NULL
          ORDER BY u2.created_at LIMIT 1)`,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(and(eq(users.id, userId), isNull(users.deletedAt), isNull(tenants.deletedAt)))
      .limit(1);
    if (!row) return null;
    return {
      platformRole: row.platformRole,
      partnerId: row.livePartnerId ?? row.accountPartnerId ?? null,
      tenantId: row.tenantId,
      role: row.role,
      partnerAccount: !!row.accountPartnerId,
    };
  }

  // telas que o plano da assinatura mais recente do cliente tira (crua, sem herança)
  async listPlanBlockedViewKeys(tenantId: string): Promise<string[]> {
    const [sub] = await this.db
      .select({ planId: subscriptions.planId })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!sub?.planId) return [];
    const rows = await this.db
      .select({ key: adyRbacPlanViewsBlocked.viewKey })
      .from(adyRbacPlanViewsBlocked)
      .where(eq(adyRbacPlanViewsBlocked.planId, sub.planId));
    return rows.map((r) => r.key);
  }

  // withDefault=false: só o escopo do parceiro, sem o padrão
  async listBlockedServiceKeys(roleKey: string, partnerId: string | null, withDefault = true): Promise<string[]> {
    const t = adyRbacServicesBlocked;
    const scope = !partnerId ? isNull(t.partnerId) : withDefault ? or(isNull(t.partnerId), eq(t.partnerId, partnerId)) : eq(t.partnerId, partnerId);
    const rows = await this.db
      .select({ key: t.serviceKey })
      .from(t)
      .where(and(eq(t.roleKey, roleKey), scope));
    return rows.map((r) => r.key);
  }

  // withDefault=false: só o escopo do parceiro, sem o padrão
  async listBlockedViewKeys(roleKey: string, partnerId: string | null, withDefault = true): Promise<string[]> {
    const t = adyRbacViewsBlocked;
    const scope = !partnerId ? isNull(t.partnerId) : withDefault ? or(isNull(t.partnerId), eq(t.partnerId, partnerId)) : eq(t.partnerId, partnerId);
    const rows = await this.db
      .select({ key: t.viewKey })
      .from(t)
      .where(and(eq(t.roleKey, roleKey), scope));
    return rows.map((r) => r.key);
  }

  // mundo do parceiro vale mesmo com parceiro/conta excluídos (bloqueia); parceiro só se estiver vivo
  async findTenantPartnerScope(tenantId: string): Promise<{ partnerWorld: boolean; partnerId: string | null } | null> {
    const rows = (await this.db.execute(sql`SELECT
        (t.partner_id IS NOT NULL OR EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id
          AND u.platform_role IN ('admin_partner', 'user_partner'))) AS "partnerWorld",
        (SELECT p.id FROM ady_partners p WHERE p.deleted_at IS NULL AND p.id = coalesce(t.partner_id,
          (SELECT u.partner_id FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL
            AND u.platform_role IN ('admin_partner', 'user_partner') AND u.partner_id IS NOT NULL
            ORDER BY u.created_at LIMIT 1))) AS "partnerId"
      FROM tenants t WHERE t.id = ${tenantId}`)) as unknown as { partnerWorld: boolean; partnerId: string | null }[];
    return rows[0] ?? null;
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
