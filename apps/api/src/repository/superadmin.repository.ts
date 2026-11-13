import {
  db as defaultDb,
  type Database,
  tenants,
  users,
  plans,
  subscriptions,
  renewalEvents,
  brandKits,
  clientGoals,
  furyConfig,
  campaigns,
  creativeAssets,
  adyPartners,
  adyRbacAuditLog,
  adyRbacPlanViewsBlocked,
} from '@fury/db';
import { and, desc, eq, gt, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';
import { provisionTrialSubscription } from '../services/billing/trial-signup.js';

type Tenant = typeof tenants.$inferSelect;
type User = typeof users.$inferSelect;
type Plan = typeof plans.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;

// ── Dashboard (stats globais) ───────────────────────────────────
export type DashboardPeriod = '7d' | '30d' | '90d';

export type ActivityItem = {
  tipo: 'novo' | 'trial' | 'plano' | 'cancelamento' | 'renovacao';
  tenantId?: string;
  tenantName: string;
  description: string;
  at: string; // ISO
};

export interface DashboardStats {
  mrrCents: number;
  activeClients: number;
  newClients: number;
  activeTrials: number;
  cancellations: number;
  plans: Array<{ planId: string; name: string; priceCents: number; interval: string; clients: number }>;
  recentActivity: ActivityItem[];
  expiredAccounts: number;
}

export type ExpiredAccountRow = {
  tenantId: string;
  status: string;
  isNonExpirable: boolean;
  currentPeriodEnd: Date | null;
};

const SETUP_TENANT_CONSTRAINTS = new Set([
  'tenants_slug_key',
  'tenants_slug_unique',
  'users_email_key',
  'users_email_unique',
  'users_email_lower_unique',
]);

function knownSetupTenantConflict(error: unknown): boolean {
  let current = error as { code?: unknown; constraint?: unknown; constraint_name?: unknown; cause?: unknown } | undefined;
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (current.code === '23505' && typeof (current.constraint ?? current.constraint_name) === 'string') {
      return SETUP_TENANT_CONSTRAINTS.has((current.constraint ?? current.constraint_name) as string);
    }
    current = current.cause as typeof current;
  }
  return false;
}

export function countExpiredAccounts(rows: ExpiredAccountRow[], now: Date): number {
  return new Set(
    rows
      .filter((row) => row.status === 'active' && !row.isNonExpirable && row.currentPeriodEnd !== null && row.currentPeriodEnd.getTime() <= now.getTime())
      .map((row) => row.tenantId),
  ).size;
}

/** Monta a lista "Atividade Recente" (puro — sem DB). Subs já vêm do JOIN com tenants/plans. */
export function mapRecentActivity(
  subs: Array<{ tenantId?: string; status: string; createdAt: Date; updatedAt: Date; tenantName: string | null; planName: string | null }>,
  newTenants: Array<{ id?: string; name: string; createdAt: Date }>,
  renewals: Array<{ tenantId?: string; tenantName: string | null; planName?: string | null; renewedAt: Date; previousPeriodEnd?: Date }> = [],
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...subs.map((s): ActivityItem => {
      const tenantName = s.tenantName ?? 'Tenant';
      if (s.status === 'cancelled')
        return { tipo: 'cancelamento', tenantId: s.tenantId, tenantName, description: s.planName ? `cancelou o plano ${s.planName}` : 'cancelou a assinatura', at: s.updatedAt.toISOString() };
      if (s.status === 'trial')
        return { tipo: 'trial', tenantId: s.tenantId, tenantName, description: s.planName ? `iniciou período trial do plano ${s.planName}` : 'iniciou período trial', at: s.createdAt.toISOString() };
      return { tipo: 'plano', tenantId: s.tenantId, tenantName, description: s.planName ? `assinou o plano ${s.planName}` : 'assinou um plano', at: s.createdAt.toISOString() };
    }),
    ...newTenants.map((t): ActivityItem => ({ tipo: 'novo', tenantId: t.id, tenantName: t.name, description: 'criou conta na plataforma', at: t.createdAt.toISOString() })),
    ...renewals.map((r): ActivityItem => ({
      tipo: 'renovacao',
      ...(r.tenantId ? { tenantId: r.tenantId } : {}),
      tenantName: r.tenantName ?? 'Tenant',
      description: r.planName ? `a conta renovou o período do plano ${r.planName}` : 'a conta renovou o período do plano',
      at: r.renewedAt.toISOString(),
    })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
}

// usuários que o parceiro alcança: só os dos clientes, nunca contas de admin
export const PARTNER_REACHABLE_ROLES = ['user', 'user_partner'];

// dono do plano: null = ady, senão o parceiro
function planOwner(partnerId: string | null) {
  return partnerId ? eq(plans.partnerId, partnerId) : isNull(plans.partnerId);
}

// clientes não excluídos; com partnerId, só os daquele parceiro
function liveTenants(partnerId: string | null) {
  return and(isNull(tenants.deletedAt), partnerId ? eq(tenants.partnerId, partnerId) : undefined);
}

/**
 * Repositório **SuperAdmin (GLOBAL)** — operações administrativas que cruzam
 * todos os tenants (CRUD de tenants, usuários, planos e assinaturas, além de
 * brand kit/goals/config por tenant). Não é escopado por tenant: todas as
 * chamadas recebem o id/tenant por parâmetro. ADR-0001.
 */
export class SuperAdminRepository extends TenantScopedRepository {
  constructor(tenantId: string = '', db: Database = defaultDb) {
    super(tenantId, db);
  }

  // ── Tenants ──────────────────────────────────────────────────────
  // partnerId null = todos os clientes (super_admin)
  async listTenants(partnerId: string | null = null) {
    return this.db.query.tenants.findMany({ where: liveTenants(partnerId) });
  }
  async getTenantById(id: string, partnerId: string | null = null) {
    return this.db.query.tenants.findFirst({ where: and(eq(tenants.id, id), liveTenants(partnerId)) });
  }
  async findTenantBySlug(slug: string) {
    return this.db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
  }

  async findUserByEmailCaseInsensitive(email: string) {
    return this.db.query.users.findFirst({
      where: eq(sql`lower(${users.email})`, email.toLowerCase()),
    });
  }

  /** Cria o par administrativo como uma unidade; o resultado de conflito não contém dados existentes. */
  async createTenantWithUser(data: {
    name: string;
    slug: string;
    userName: string;
    userEmail: string;
    passwordHash: string;
    userRole: User['role'];
  }) {
    try {
      return await this.db.transaction(async (tx) => {
        const [tenant] = await tx.insert(tenants).values({ name: data.name, slug: data.slug }).returning();
        const [user] = await tx.insert(users).values({
          tenantId: tenant.id,
          name: data.userName,
          email: data.userEmail,
          passwordHash: data.passwordHash,
          role: data.userRole,
        }).returning();
        await provisionTrialSubscription({
          queryPlan: async (key) => (await tx.query.plans.findFirst({ where: and(eq(plans.technicalKey, key), isNull(plans.partnerId)) })) ?? null,
          querySubscription: async (tenantId) => (await tx.query.subscriptions.findFirst({ where: eq(subscriptions.tenantId, tenantId) })) ?? null,
          insertSubscription: async (values) => {
            const [subscription] = await tx.insert(subscriptions).values(values as typeof subscriptions.$inferInsert).returning({ id: subscriptions.id });
            return subscription;
          },
        }, tenant.id, new Date());
        return { status: 'created' as const, tenant, user };
      });
    } catch (error) {
      if (!knownSetupTenantConflict(error)) throw error;

      // A transação já foi revertida. A ordem é parte do contrato: slug prevalece
      // quando os dois recursos estão em conflito.
      if (await this.findTenantBySlug(data.slug)) return { status: 'conflict' as const, code: 'SLUG_EXISTS' as const };
      if (await this.findUserByEmailCaseInsensitive(data.userEmail)) return { status: 'conflict' as const, code: 'EMAIL_EXISTS' as const };
      throw error;
    }
  }

  // ── Clientes do parceiro ─────────────────────────────────────────
  // vagas do próprio parceiro: sem chave nem e-mail da conta
  async partnerSlots(partnerId: string) {
    const [row] = await this.db
      .select({
        id: adyPartners.id,
        name: adyPartners.name,
        maxTenants: adyPartners.maxTenants,
        usedTenants: sql<number>`(SELECT count(*)::int FROM tenants t WHERE t.partner_id = "ady_partners"."id" AND t.deleted_at IS NULL)`.mapWith(Number),
      })
      .from(adyPartners)
      .where(and(eq(adyPartners.id, partnerId), isNull(adyPartners.deletedAt)));
    return row ?? null;
  }

  // cliente + dono (+ assinatura no plano do parceiro); linha do parceiro travada = nunca passa do limite
  async createPartnerClient(
    partnerId: string,
    data: { name: string; slug: string; userName: string; userEmail: string; passwordHash: string; planId?: string },
  ) {
    return this.db.transaction(async (tx) => {
      const [partner] = await tx
        .select({ maxTenants: adyPartners.maxTenants })
        .from(adyPartners)
        .where(and(eq(adyPartners.id, partnerId), isNull(adyPartners.deletedAt)))
        .for('update');
      if (!partner) return { status: 'not_found' as const };
      const [{ used }] = await tx.select({ used: sql<number>`count(*)::int`.mapWith(Number) }).from(tenants).where(liveTenants(partnerId));
      if (used! >= partner.maxTenants) return { status: 'limit' as const, maxTenants: partner.maxTenants };
      // plano escolhido: só um plano ativo do próprio parceiro
      const plan = data.planId
        ? await tx.query.plans.findFirst({ where: and(eq(plans.id, data.planId), eq(plans.partnerId, partnerId), eq(plans.isActive, true)) })
        : undefined;
      if (data.planId && !plan) return { status: 'plan_not_found' as const };

      const [tenant] = await tx.insert(tenants).values({ name: data.name, slug: data.slug, partnerId }).returning();
      const [user] = await tx
        .insert(users)
        .values({ tenantId: tenant!.id, name: data.userName, email: data.userEmail, passwordHash: data.passwordHash, role: 'owner', platformRole: 'user_partner' })
        .returning();

      // com plano: assinatura ativa por 30 dias; sem plano, o parceiro atribui depois
      if (plan) {
        await tx.insert(subscriptions).values({
          tenantId: tenant!.id,
          planId: plan.id,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          creativesRemaining: (plan.limits as { creativesPerMonth?: number | null } | null)?.creativesPerMonth ?? null,
        });
      }
      return { status: 'created' as const, tenant: tenant!, user: user! };
    });
  }
  async createTenant(data: Partial<Tenant>): Promise<Tenant> {
    const [row] = await this.db.insert(tenants).values(data as any).returning();
    return row;
  }
  async updateTenant(id: string, data: Partial<Tenant>) {
    const [row] = await this.db.update(tenants).set(data as any).where(eq(tenants.id, id)).returning();
    return row ?? null;
  }
  // soft-delete: usuários do cliente perdem o acesso junto
  async deleteTenant(id: string) {
    await this.db.update(tenants).set({ deletedAt: new Date() }).where(eq(tenants.id, id));
  }
  async countUsersByTenant(tenantId: string): Promise<number> {
    const rows = await this.db.select({ total: sql`count(*)::int` }).from(users).where(and(eq(users.tenantId, tenantId), isNull(users.deletedAt)));
    return Number((rows[0] as any)?.total ?? 0);
  }
  async hasAccessibleSubscription(tenantId: string, now: Date = new Date()): Promise<boolean> {
    const subscription = await this.db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.status, 'active'),
        or(
          eq(subscriptions.isNonExpirable, true),
          isNull(subscriptions.currentPeriodEnd),
          gt(subscriptions.currentPeriodEnd, now),
        ),
      ),
    });
    return !!subscription;
  }

  // ── Users ────────────────────────────────────────────────────────
  // inclui excluídos: o e-mail continua preso
  async findUserByEmail(email: string) {
    return this.db.query.users.findFirst({ where: eq(users.email, email) });
  }
  async findUserById(id: string) {
    return this.db.query.users.findFirst({ where: and(eq(users.id, id), isNull(users.deletedAt)) });
  }
  // troca a senha e registra quem fez, nunca a senha
  async resetUserPassword(
    user: { id: string; tenantId: string; email: string; partnerId?: string | null },
    passwordHash: string,
    actor: { userId: string; partnerId: string | null },
  ) {
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, resetToken: null, resetTokenExpiresAt: null }).where(eq(users.id, user.id));
      const [tenant] = await tx.select({ partnerId: tenants.partnerId }).from(tenants).where(eq(tenants.id, user.tenantId));
      await tx.insert(adyRbacAuditLog).values({
        actorUserId: actor.userId,
        action: 'user_password_reset',
        entityType: 'user',
        entityKey: user.id,
        partnerId: tenant?.partnerId ?? user.partnerId ?? null,
        details: { tenantId: user.tenantId, email: user.email, byPartner: actor.partnerId !== null },
      });
    });
  }
  async findOwnerUser(tenantId: string) {
    return this.db.query.users.findFirst({ where: and(eq(users.tenantId, tenantId), eq(users.role, 'owner')) });
  }
  async listUsersByTenant(tenantId: string) {
    return this.db.query.users.findMany({ where: and(eq(users.tenantId, tenantId), isNull(users.deletedAt)) });
  }
  async listUsersPaged(search: string, limit: number, offset: number) {
    const like = `%${search}%`;
    return this.db.query.users.findMany({
      where: or(ilike(users.name, like), ilike(users.email, like)),
      limit,
      offset,
      orderBy: [desc(users.createdAt)],
    });
  }
  async countUsersPaged(search: string): Promise<number> {
    const like = `%${search}%`;
    const rows = await this.db
      .select({ total: sql`count(*)::int` })
      .from(users)
      .where(or(ilike(users.name, like), ilike(users.email, like)));
    return Number((rows[0] as any)?.total ?? 0);
  }
  async createUser(data: Partial<User>): Promise<User> {
    const [row] = await this.db.insert(users).values(data as any).returning();
    return row;
  }
  // trava o cliente: duas criações simultâneas não passam do limite
  async createMemberWithinLimit(data: Partial<User> & { tenantId: string }, max: number): Promise<User | null> {
    return this.db.transaction(async (tx) => {
      await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, data.tenantId)).for('update');
      const [{ used }] = await tx
        .select({ used: sql<number>`count(*)::int`.mapWith(Number) })
        .from(users)
        .where(and(eq(users.tenantId, data.tenantId), eq(users.role, 'member'), isNull(users.deletedAt)));
      if (used! >= max) return null;
      const [row] = await tx.insert(users).values(data as any).returning();
      return row;
    });
  }
  async updateUser(id: string, data: Partial<User>) {
    const [row] = await this.db.update(users).set(data as any).where(eq(users.id, id)).returning();
    return row ?? null;
  }
  async updateUserAudienceDefaults(id: string, audienceDefaults: any) {
    const [row] = await this.db.update(users).set({ audienceDefaults: audienceDefaults as any }).where(eq(users.id, id)).returning();
    return row ?? null;
  }
  async deleteUser(id: string) {
    await this.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
  }

  // ── Plans ────────────────────────────────────────────────────────
  // partnerId null = planos da ady; senão só os daquele parceiro
  async listPlans(partnerId: string | null = null) {
    const rows = await this.db.query.plans.findMany({ where: planOwner(partnerId), orderBy: [desc(plans.createdAt)] });
    const views = await this.listPlanBlockedViews(rows.map((p) => p.id));
    return rows.map((p) => ({ ...p, blockedViews: views.get(p.id) ?? [] }));
  }
  // funcionalidades tiradas por plano (forma crua)
  async listPlanBlockedViews(planIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (!planIds.length) return map;
    const rows = await this.db
      .select({ planId: adyRbacPlanViewsBlocked.planId, key: adyRbacPlanViewsBlocked.viewKey })
      .from(adyRbacPlanViewsBlocked)
      .where(inArray(adyRbacPlanViewsBlocked.planId, planIds));
    for (const r of rows) map.set(r.planId, [...(map.get(r.planId) ?? []), r.key]);
    return map;
  }
  // troca o conjunto inteiro, tudo ou nada
  private async replacePlanViews(tx: Pick<Database, 'delete' | 'insert'>, planId: string, keys: string[], actorId: string | null) {
    await tx.delete(adyRbacPlanViewsBlocked).where(eq(adyRbacPlanViewsBlocked.planId, planId));
    if (keys.length)
      await tx.insert(adyRbacPlanViewsBlocked).values(keys.map((viewKey) => ({ planId, viewKey, createdBy: actorId })));
  }
  async createPlanWithViews(data: Partial<Plan>, blockedViews: string[], actorId: string | null): Promise<Plan & { blockedViews: string[] }> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(plans).values(data as any).returning();
      await this.replacePlanViews(tx, row!.id, blockedViews, actorId);
      return { ...row!, blockedViews };
    });
  }
  async updatePlanWithViews(id: string, data: Partial<Plan>, blockedViews: string[] | undefined, actorId: string | null) {
    if (data.technicalKey !== undefined) {
      const existing = await this.db.query.plans.findFirst({ where: eq(plans.id, id) });
      if (existing?.technicalKey && existing.technicalKey !== data.technicalKey) {
        throw new Error('PLAN_TECHNICAL_KEY_IMMUTABLE');
      }
    }
    await this.db.transaction(async (tx) => {
      if (Object.keys(data).length) await tx.update(plans).set(data as any).where(eq(plans.id, id));
      if (blockedViews !== undefined) await this.replacePlanViews(tx, id, blockedViews, actorId);
    });
  }
  async findPlanById(id: string) {
    return this.db.query.plans.findFirst({ where: eq(plans.id, id) });
  }
  async findPlanInScope(id: string, partnerId: string | null) {
    return this.db.query.plans.findFirst({ where: and(eq(plans.id, id), planOwner(partnerId)) });
  }
  async getFirstPlan(partnerId: string | null = null) {
    return this.db.query.plans.findFirst({ where: planOwner(partnerId), orderBy: [plans.createdAt] });
  }
  async createPlan(data: Partial<Plan>): Promise<Plan> {
    const [row] = await this.db.insert(plans).values(data as any).returning();
    return row;
  }
  async updatePlan(id: string, data: Partial<Plan>) {
    if (data.technicalKey !== undefined) {
      const existing = await this.db.query.plans.findFirst({ where: eq(plans.id, id) });
      if (existing?.technicalKey && existing.technicalKey !== data.technicalKey) {
        throw new Error('PLAN_TECHNICAL_KEY_IMMUTABLE');
      }
    }
    const [row] = await this.db.update(plans).set(data as any).where(eq(plans.id, id)).returning();
    return row ?? null;
  }
  async deletePlan(id: string) {
    await this.db.delete(plans).where(eq(plans.id, id));
  }
  async countSubscriptionsByPlan(planId: string): Promise<number> {
    const rows = await this.db.select({ total: sql`count(*)::int` }).from(subscriptions).where(eq(subscriptions.planId, planId));
    return Number((rows[0] as any)?.total ?? 0);
  }

  /** Contagem de assinantes por plano (group-by) para a lista de planos. */
  async listSubscriberCountsByPlan(): Promise<Array<{ planId: string; count: number }>> {
    const rows = await this.db
      .select({ planId: subscriptions.planId, count: sql<number>`count(*)::int`.mapWith(Number) })
      .from(subscriptions)
      .groupBy(subscriptions.planId);
    return rows as Array<{ planId: string; count: number }>;
  }

  /** Usuários paginados com nome do tenant (join), busca por nome/email/tenant. */
  async paginateUsersAdmin(search: string, limit: number, offset: number, partnerId: string | null = null) {
    const where = and(
      isNull(users.deletedAt),
      liveTenants(partnerId),
      partnerId ? inArray(users.platformRole, PARTNER_REACHABLE_ROLES) : undefined,
      search
        ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`), ilike(tenants.name, `%${search}%`))
        : undefined,
    );

    const [countResult] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(where);

    const total = Number((countResult as any)?.total ?? 0);

    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        platformRole: users.platformRole,
        tenantId: users.tenantId,
        createdAt: users.createdAt,
        tenantName: tenants.name,
      })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return { rows, total };
  }

  // ── Subscriptions ────────────────────────────────────────────────
  async findLatestSubscriptionByTenant(tenantId: string) {
    return this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.tenantId, tenantId),
      orderBy: [desc(subscriptions.createdAt)],
    });
  }
  async createSubscription(data: Partial<Subscription>): Promise<Subscription> {
    const [row] = await this.db.insert(subscriptions).values(data as any).returning();
    return row;
  }
  async updateSubscription(id: string, data: Partial<Subscription>) {
    const [row] = await this.db.update(subscriptions).set(data as any).where(eq(subscriptions.id, id)).returning();
    return row ?? null;
  }
  async migratePlanSubscriptions(fromPlanId: string, toPlanId: string) {
    await this.db.update(subscriptions).set({ planId: toPlanId }).where(eq(subscriptions.planId, fromPlanId));
  }

  // ── Brand kit / goals / furyConfig (por tenant) ──────────────────
  async findBrandKitByTenant(tenantId: string) {
    return this.db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, tenantId) });
  }
  async updateBrandKit(tenantId: string, data: Record<string, unknown>) {
    const [row] = await this.db.update(brandKits).set(data as any).where(eq(brandKits.tenantId, tenantId)).returning();
    return row ?? null;
  }
  async createBrandKit(data: Record<string, unknown>) {
    const [row] = await this.db.insert(brandKits).values(data as any).returning();
    return row;
  }
  async findClientGoalByTenant(tenantId: string) {
    return this.db.query.clientGoals.findFirst({ where: eq(clientGoals.tenantId, tenantId) });
  }
  async updateClientGoal(tenantId: string, data: Record<string, unknown>) {
    const [row] = await this.db.update(clientGoals).set(data as any).where(eq(clientGoals.tenantId, tenantId)).returning();
    return row ?? null;
  }
  async createClientGoal(data: Record<string, unknown>) {
    const [row] = await this.db.insert(clientGoals).values(data as any).returning();
    return row;
  }
  async findFuryConfig(tenantId: string) {
    return this.db.query.furyConfig.findFirst({ where: eq(furyConfig.tenantId, tenantId) });
  }
  async updateFuryConfig(tenantId: string, data: Record<string, unknown>) {
    const [row] = await this.db.update(furyConfig).set(data as any).where(eq(furyConfig.tenantId, tenantId)).returning();
    return row ?? null;
  }
  async createFuryConfig(data: Record<string, unknown>) {
    const [row] = await this.db.insert(furyConfig).values(data as any).returning();
    return row;
  }

  // ── Campaigns / creative assets (por tenant) ─────────────────────
  async findCampaignsByTenant(tenantId: string) {
    return this.db.query.campaigns.findMany({ where: eq(campaigns.tenantId, tenantId) });
  }
  async findCreativeAssetsByTenant(tenantId: string) {
    return this.db.query.creativeAssets.findMany({ where: eq(creativeAssets.tenantId, tenantId) });
  }

  // ── Dashboard (stats globais) ───────────────────────────────────
  async getDashboardStats(period: DashboardPeriod, partnerId: string | null = null): Promise<DashboardStats> {
    const days = parseInt(period, 10);
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const now = new Date();
    // cliente excluído (soft-delete) ou de outro parceiro fica fora das contas
    const ofPartner = partnerId ? sql` AND partner_id = ${partnerId}` : sql``;
    const liveTenant = sql`${subscriptions.tenantId} IN (SELECT id FROM tenants WHERE deleted_at IS NULL${ofPartner})`;

    // "Ativa" = mesma semântica do middleware checkSubscriptionActive
    const activeSubs = await this.db.query.subscriptions.findMany({
      where: and(
        liveTenant,
        eq(subscriptions.status, 'active'),
        or(
          eq(subscriptions.isNonExpirable, true),
          isNull(subscriptions.currentPeriodEnd),
          gt(subscriptions.currentPeriodEnd, now)
        )
      ),
    });
    const trialSubs = await this.db.query.subscriptions.findMany({
      where: and(liveTenant, eq(subscriptions.status, 'trial'), or(isNull(subscriptions.trialEndsAt), gt(subscriptions.trialEndsAt, now))),
    });

    const planIds = [...new Set(activeSubs.map((s) => s.planId))];
    const planRows = planIds.length ? await this.db.query.plans.findMany({ where: inArray(plans.id, planIds) }) : [];
    const planById = new Map(planRows.map((p) => [p.id, p]));

    // MRR proxy (sem gateway): soma do preço mensal dos planos ativos; anual ÷ 12
    const mrrCents = activeSubs.reduce((sum, s) => {
      const p = planById.get(s.planId);
      if (!p) return sum;
      return sum + (p.interval === 'yearly' ? Math.round(p.priceCents / 12) : p.priceCents);
    }, 0);

    const countByPlan = new Map<string, number>();
    for (const s of activeSubs) countByPlan.set(s.planId, (countByPlan.get(s.planId) ?? 0) + 1);

    const [newClientsRow] = await this.db
      .select({ total: sql<number>`count(*)::int`.mapWith(Number) })
      .from(tenants)
      .where(and(liveTenants(partnerId), gte(tenants.createdAt, start)));
    const [cancelRow] = await this.db
      .select({ total: sql<number>`count(*)::int`.mapWith(Number) })
      .from(subscriptions)
      .where(and(liveTenant, eq(subscriptions.status, 'cancelled'), gte(subscriptions.updatedAt, start)));

    const recentSubs = await this.db
      .select({
        tenantId: subscriptions.tenantId,
        status: subscriptions.status,
        createdAt: subscriptions.createdAt,
        updatedAt: subscriptions.updatedAt,
        tenantName: tenants.name,
        planName: plans.name,
      })
      .from(subscriptions)
      .leftJoin(tenants, eq(subscriptions.tenantId, tenants.id))
      .leftJoin(plans, eq(subscriptions.planId, plans.id))
      .where(liveTenant)
      .orderBy(desc(sql`GREATEST(${subscriptions.createdAt}, ${subscriptions.updatedAt})`))
      .limit(10);

    const recentNewTenants = await this.db.query.tenants.findMany({
      where: and(liveTenants(partnerId), gte(tenants.createdAt, start)),
      orderBy: [desc(tenants.createdAt)],
      limit: 5,
    });

    const expiredRows = await this.db
      .select({
        tenantId: subscriptions.tenantId,
        status: subscriptions.status,
        isNonExpirable: subscriptions.isNonExpirable,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .where(and(
        liveTenant,
        eq(subscriptions.status, 'active'),
        eq(subscriptions.isNonExpirable, false),
        lte(subscriptions.currentPeriodEnd, now),
      ));

    const recentRenewals = await this.db
      .select({
        tenantId: renewalEvents.tenantId,
        tenantName: tenants.name,
        planName: plans.name,
        renewedAt: renewalEvents.renewedAt,
        previousPeriodEnd: renewalEvents.previousPeriodEnd,
      })
      .from(renewalEvents)
      .leftJoin(tenants, eq(renewalEvents.tenantId, tenants.id))
      .leftJoin(subscriptions, eq(renewalEvents.subscriptionId, subscriptions.id))
      .leftJoin(plans, eq(subscriptions.planId, plans.id))
      .where(and(
        sql`${renewalEvents.tenantId} IN (SELECT id FROM tenants WHERE deleted_at IS NULL${ofPartner})`,
        gte(renewalEvents.renewedAt, start),
      ))
      .orderBy(desc(renewalEvents.renewedAt))
      .limit(10);

    return {
      mrrCents,
      activeClients: activeSubs.length,
      newClients: Number((newClientsRow as any)?.total ?? 0),
      activeTrials: trialSubs.length,
      cancellations: Number((cancelRow as any)?.total ?? 0),
      plans: [...countByPlan.entries()]
        .map(([planId, clients]) => {
          const p = planById.get(planId);
          return { planId, name: p?.name ?? 'Plano removido', priceCents: p?.priceCents ?? 0, interval: p?.interval ?? 'monthly', clients };
        })
        .sort((a, b) => b.clients - a.clients),
      expiredAccounts: countExpiredAccounts(expiredRows as any, now),
      recentActivity: mapRecentActivity(recentSubs as any, recentNewTenants as any, recentRenewals as any),
    };
  }
}
