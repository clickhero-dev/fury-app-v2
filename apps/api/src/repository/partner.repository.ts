import { db as defaultDb, type Database, adyPartners, adyPartnerPayments, adyPartnerPlans, adyPartnerPlanViewsBlocked, adyRbacAuditLog, adyRbacServicesBlocked, adyRbacViewsBlocked, tenants, users } from '@fury/db';
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PartnerSummary {
  id: string;
  name: string;
  maxTenants: number;
  usedTenants: number;
  accountEmail: string | null;
  accountUserId: string | null;
  keyLast4: string | null;
  createdAt: Date;
  partnerPlanId: string | null;
  partnerPlanName: string | null;
  partnerPlanPriceCents: number | null;
  partnerPlanMaxTenants: number | null;
}

// cópia do plano de parceiro: vagas + telas (com os serviços de cada tela)
export type ServicesOf = (viewKey: string) => string[];
export interface PlanSnapshot {
  id: string;
  name: string;
  maxTenants: number;
  views: { key: string; services: string[] }[];
}

export type PartnerPaymentKind = 'plan' | 'additional';

export interface PartnerPayment {
  id: string;
  kind: PartnerPaymentKind;
  amountCents: number;
  paidAt: string;
  note: string | null;
  createdByName: string | null;
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
        partnerPlanId: adyPartners.partnerPlanId,
        partnerPlanName: adyPartnerPlans.name,
        partnerPlanPriceCents: adyPartnerPlans.priceCents,
        partnerPlanMaxTenants: adyPartnerPlans.maxTenants,
        // vagas: clientes do parceiro não excluídos
        usedTenants: sql<number>`(SELECT count(*)::int FROM tenants t WHERE t.partner_id = "ady_partners"."id" AND t.deleted_at IS NULL)`.mapWith(Number),
        accountEmail: sql<string | null>`(SELECT u.email FROM users u WHERE u.partner_id = "ady_partners"."id" AND u.platform_role = 'admin_partner' AND u.deleted_at IS NULL ORDER BY u.created_at LIMIT 1)`,
        accountUserId: sql<string | null>`(SELECT u.id FROM users u WHERE u.partner_id = "ady_partners"."id" AND u.platform_role = 'admin_partner' AND u.deleted_at IS NULL ORDER BY u.created_at LIMIT 1)`,
      })
      .from(adyPartners)
      .leftJoin(adyPartnerPlans, eq(adyPartnerPlans.id, adyPartners.partnerPlanId))
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

  // empresa + cliente próprio + conta admin_partner + cópia do plano, tudo ou nada
  async createWithAccount(name: string, customMaxTenants: number | undefined, slug: string, account: NewPartnerAccount, planId: string, servicesOf: ServicesOf, roleKeys: string[], actorUserId: string) {
    return this.db.transaction(async (tx) => {
      const plan = await lockedPlan(tx, planId, servicesOf);
      // vagas enviadas = ajuste individual
      const maxTenants = customMaxTenants ?? plan.maxTenants;
      const [partner] = await tx.insert(adyPartners).values({ name, maxTenants, partnerPlanId: plan.id }).returning();
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
      await copyPlanViews(tx, partner!.id, plan, roleKeys, actorUserId);
      await tx.insert(adyRbacAuditLog).values({
        actorUserId,
        action: 'partner_plan_assigned',
        entityType: 'partner',
        entityKey: partner!.id,
        partnerId: partner!.id,
        details: { partnerPlanId: plan.id, maxTenants, blockedViews: plan.views.map((v) => v.key), on: 'create' },
      });
      return { partner: partner!, tenantId: tenant!.id, user: user!, plan };
    });
  }

  // vincula plano a parceiro sem plano: copia vagas e telas; a corrida fica no UPDATE condicional
  async assignPlan(partnerId: string, planId: string, servicesOf: ServicesOf, roleKeys: string[], actorUserId: string): Promise<'ok' | 'has_plan' | { belowUsage: number; plan: PlanSnapshot }> {
    try {
      return await this.db.transaction(async (tx) => {
        const plan = await lockedPlan(tx, planId, servicesOf);
        const updated = await tx
          .update(adyPartners)
          .set({ partnerPlanId: plan.id, maxTenants: plan.maxTenants, updatedAt: new Date() })
          .where(and(eq(adyPartners.id, partnerId), isNull(adyPartners.partnerPlanId), isNull(adyPartners.deletedAt)))
          .returning({ id: adyPartners.id });
        if (!updated.length) return 'has_plan' as const;

        const [usage] = await tx.select({ n: sql<number>`count(*)::int`.mapWith(Number) }).from(tenants)
          .where(and(eq(tenants.partnerId, partnerId), isNull(tenants.deletedAt)));
        if ((usage?.n ?? 0) > plan.maxTenants) throw new BelowUsage(usage!.n, plan);

        // telas do parceiro passam a ser as do plano
        await tx.delete(adyRbacViewsBlocked).where(and(eq(adyRbacViewsBlocked.partnerId, partnerId), inArray(adyRbacViewsBlocked.roleKey, roleKeys)));
        await tx.delete(adyRbacServicesBlocked).where(and(eq(adyRbacServicesBlocked.partnerId, partnerId), inArray(adyRbacServicesBlocked.roleKey, roleKeys)));
        await copyPlanViews(tx, partnerId, plan, roleKeys, actorUserId);
        await tx.insert(adyRbacAuditLog).values({
          actorUserId,
          action: 'partner_plan_assigned',
          entityType: 'partner',
          entityKey: partnerId,
          partnerId,
          details: { partnerPlanId: plan.id, maxTenants: plan.maxTenants, blockedViews: plan.views.map((v) => v.key), on: 'assign' },
        });
        return 'ok' as const;
      });
    } catch (err) {
      if (err instanceof BelowUsage) return { belowUsage: err.used, plan: err.plan };
      throw err;
    }
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

  // ── Chave de IA (criptografada; a chave em claro nunca sai daqui) ──
  async getAiKeyStatus(partnerId: string) {
    const [row] = await this.db
      .select({ last4: adyPartners.openrouterKeyLast4 })
      .from(adyPartners)
      .where(and(eq(adyPartners.id, partnerId), isNull(adyPartners.deletedAt)));
    return row ? { configured: row.last4 !== null, last4: row.last4 } : null;
  }

  // grava (ou limpa, com null) e registra no histórico, sem o valor
  async setAiKey(partnerId: string, value: { encrypted: string; last4: string } | null, actorUserId: string) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(adyPartners)
        .set({ openrouterKeyEncrypted: value?.encrypted ?? null, openrouterKeyLast4: value?.last4 ?? null, updatedAt: new Date() })
        .where(eq(adyPartners.id, partnerId));
      await tx.insert(adyRbacAuditLog).values({
        actorUserId,
        action: value ? 'ai_key_set' : 'ai_key_cleared',
        entityType: 'partner',
        entityKey: partnerId,
        partnerId,
        details: value ? { last4: value.last4 } : {},
      });
    });
  }

  // ── Pagamentos do parceiro (histórico; só super) ──
  async listPayments(partnerId: string): Promise<PartnerPayment[]> {
    return this.payments(eq(adyPartnerPayments.partnerId, partnerId));
  }

  async findPayment(partnerId: string, paymentId: string): Promise<PartnerPayment | null> {
    return (await this.payments(and(eq(adyPartnerPayments.partnerId, partnerId), eq(adyPartnerPayments.id, paymentId))!))[0] ?? null;
  }

  // pagamentos com o nome de quem registrou, do mais recente
  private async payments(where: SQL): Promise<PartnerPayment[]> {
    const rows = await this.db
      .select({
        id: adyPartnerPayments.id,
        kind: adyPartnerPayments.kind,
        amountCents: adyPartnerPayments.amountCents,
        paidAt: adyPartnerPayments.paidAt,
        note: adyPartnerPayments.note,
        createdByName: users.name,
        createdAt: adyPartnerPayments.createdAt,
      })
      .from(adyPartnerPayments)
      .leftJoin(users, eq(users.id, adyPartnerPayments.createdBy))
      .where(where)
      .orderBy(desc(adyPartnerPayments.paidAt), desc(adyPartnerPayments.createdAt));
    return rows as PartnerPayment[];
  }

  async createPayment(partnerId: string, data: { kind: PartnerPaymentKind; amountCents: number; paidAt: string; note: string | null }, actorUserId: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(adyPartnerPayments)
        .values({ partnerId, kind: data.kind, amountCents: data.amountCents, paidAt: data.paidAt, note: data.note, createdBy: actorUserId })
        .returning({ id: adyPartnerPayments.id });
      await tx.insert(adyRbacAuditLog).values({
        actorUserId,
        action: 'partner_payment_created',
        entityType: 'partner',
        entityKey: partnerId,
        partnerId,
        details: { paymentId: payment!.id, kind: data.kind, amountCents: data.amountCents, paidAt: data.paidAt },
      });
      return payment!.id;
    });
  }

  // false = pagamento não é deste parceiro
  async deletePayment(partnerId: string, paymentId: string, actorUserId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(adyPartnerPayments)
        .where(and(eq(adyPartnerPayments.id, paymentId), eq(adyPartnerPayments.partnerId, partnerId)))
        .returning({ kind: adyPartnerPayments.kind, amountCents: adyPartnerPayments.amountCents, paidAt: adyPartnerPayments.paidAt });
      if (!removed) return false;
      await tx.insert(adyRbacAuditLog).values({
        actorUserId,
        action: 'partner_payment_deleted',
        entityType: 'partner',
        entityKey: partnerId,
        partnerId,
        details: { paymentId, kind: removed.kind, amountCents: removed.amountCents, paidAt: removed.paidAt },
      });
      return true;
    });
  }

  // cota e vídeo: na dúvida (id inválido, erro), segue a regra normal do cliente
  async isPartnerAccount(tenantId: string): Promise<boolean> {
    if (!UUID_RE.test(tenantId)) return false;
    try {
      return !!(await this.findPartnerAccount(tenantId));
    } catch (err) {
      console.error('[partner-account] falha ao identificar a conta do parceiro; segue a regra normal:', (err as Error).message);
      return false;
    }
  }

  // conta própria do parceiro (cliente sem partner_id com usuário admin_partner vivo); null = não é
  async findPartnerAccount(tenantId: string): Promise<{ partnerId: string; partnerName: string; planName: string | null } | null> {
    const rows = (await this.db.execute(sql`SELECT p.id AS "partnerId", p.name AS "partnerName", pl.name AS "planName"
      FROM tenants t
      JOIN users u ON u.tenant_id = t.id AND u.platform_role = 'admin_partner' AND u.deleted_at IS NULL
      JOIN ady_partners p ON p.id = u.partner_id AND p.deleted_at IS NULL
      LEFT JOIN ady_partner_plans pl ON pl.id = p.partner_plan_id
      WHERE t.id = ${tenantId} AND t.partner_id IS NULL
      ORDER BY u.created_at LIMIT 1`)) as unknown as { partnerId: string; partnerName: string; planName: string | null }[];
    return rows[0] ?? null;
  }

  // parceiro dono do cliente (ou da conta própria do parceiro) e a chave dele; cliente ady = partnerId null
  async findAiKeyByTenant(tenantId: string) {
    const [row] = await this.db
      .select({
        partnerId: sql<string | null>`coalesce(${tenants.partnerId}, (SELECT u.partner_id FROM users u WHERE u.tenant_id = "tenants"."id" AND u.platform_role = 'admin_partner' AND u.partner_id IS NOT NULL LIMIT 1))`,
        // conta de parceiro mesmo sem vínculo (ex.: parceiro apagado no banco): nunca vira cliente ady
        partnerAccount: sql<boolean>`EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = "tenants"."id" AND u.platform_role = 'admin_partner')`,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!row) return null;
    if (!row.partnerId) return row.partnerAccount ? { partnerId: 'sem-vinculo', encrypted: null } : { partnerId: null, encrypted: null };
    // parceiro excluído = sem chave
    const [partner] = await this.db
      .select({ encrypted: adyPartners.openrouterKeyEncrypted })
      .from(adyPartners)
      .where(and(eq(adyPartners.id, row.partnerId), isNull(adyPartners.deletedAt)));
    return { partnerId: row.partnerId, encrypted: partner?.encrypted ?? null };
  }
}

// desfaz a transação quando o uso passa das vagas do plano
class BelowUsage extends Error {
  constructor(public used: number, public plan: PlanSnapshot) {
    super('below usage');
  }
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

// plano lido na transação; FOR SHARE faz a edição do plano esperar
async function lockedPlan(tx: Tx, planId: string, servicesOf: ServicesOf): Promise<PlanSnapshot> {
  const [plan] = await tx
    .select({ id: adyPartnerPlans.id, name: adyPartnerPlans.name, maxTenants: adyPartnerPlans.maxTenants, isActive: adyPartnerPlans.isActive })
    .from(adyPartnerPlans)
    .where(eq(adyPartnerPlans.id, planId))
    .for('share');
  if (!plan) throw new AppError(404, 'PARTNER_PLAN_NOT_FOUND', 'O plano escolhido não existe ou foi removido.');
  if (!plan.isActive) throw new AppError(400, 'PARTNER_PLAN_INACTIVE', `O plano ${plan.name} está inativo e não pode ser vinculado.`);
  const views = await tx
    .select({ key: adyPartnerPlanViewsBlocked.viewKey })
    .from(adyPartnerPlanViewsBlocked)
    .where(eq(adyPartnerPlanViewsBlocked.partnerPlanId, planId));
  return { id: plan.id, name: plan.name, maxTenants: plan.maxTenants, views: views.map((v) => ({ key: v.key, services: servicesOf(v.key) })) };
}

// bloqueios do plano gravados no escopo do parceiro
async function copyPlanViews(tx: Tx, partnerId: string, plan: PlanSnapshot, roleKeys: string[], actorUserId: string) {
  for (const roleKey of roleKeys) {
    for (const view of plan.views) {
      await tx.insert(adyRbacViewsBlocked).values({ roleKey, partnerId, viewKey: view.key, createdBy: actorUserId }).onConflictDoNothing();
      for (const serviceKey of view.services)
        await tx.insert(adyRbacServicesBlocked).values({ roleKey, partnerId, serviceKey, createdBy: actorUserId }).onConflictDoNothing();
    }
  }
}
