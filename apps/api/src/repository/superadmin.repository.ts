import {
  db as defaultDb,
  type Database,
  tenants,
  users,
  plans,
  subscriptions,
  brandKits,
  clientGoals,
  furyConfig,
  campaigns,
  creativeAssets,
} from '@fury/db';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type Tenant = typeof tenants.$inferSelect;
type User = typeof users.$inferSelect;
type Plan = typeof plans.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;

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
  async listTenants() {
    return this.db.query.tenants.findMany();
  }
  async getTenantById(id: string) {
    return this.db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  }
  async findTenantBySlug(slug: string) {
    return this.db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
  }
  async createTenant(data: Partial<Tenant>): Promise<Tenant> {
    const [row] = await this.db.insert(tenants).values(data as any).returning();
    return row;
  }
  async updateTenant(id: string, data: Partial<Tenant>) {
    const [row] = await this.db.update(tenants).set(data as any).where(eq(tenants.id, id)).returning();
    return row ?? null;
  }
  async deleteTenant(id: string) {
    await this.db.delete(tenants).where(eq(tenants.id, id));
  }
  async countUsersByTenant(tenantId: string): Promise<number> {
    const rows = await this.db.select({ total: sql`count(*)::int` }).from(users).where(eq(users.tenantId, tenantId));
    return Number((rows[0] as any)?.total ?? 0);
  }

  // ── Users ────────────────────────────────────────────────────────
  async findUserByEmail(email: string) {
    return this.db.query.users.findFirst({ where: eq(users.email, email) });
  }
  async findUserById(id: string) {
    return this.db.query.users.findFirst({ where: eq(users.id, id) });
  }
  async findOwnerUser(tenantId: string) {
    return this.db.query.users.findFirst({ where: and(eq(users.tenantId, tenantId), eq(users.role, 'owner')) });
  }
  async listUsersByTenant(tenantId: string) {
    return this.db.query.users.findMany({ where: eq(users.tenantId, tenantId) });
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
  async updateUser(id: string, data: Partial<User>) {
    const [row] = await this.db.update(users).set(data as any).where(eq(users.id, id)).returning();
    return row ?? null;
  }
  async updateUserAudienceDefaults(id: string, audienceDefaults: any) {
    const [row] = await this.db.update(users).set({ audienceDefaults: audienceDefaults as any }).where(eq(users.id, id)).returning();
    return row ?? null;
  }
  async deleteUser(id: string) {
    await this.db.delete(users).where(eq(users.id, id));
  }

  // ── Plans ────────────────────────────────────────────────────────
  async listPlans() {
    return this.db.query.plans.findMany({ orderBy: [desc(plans.createdAt)] });
  }
  async findPlanById(id: string) {
    return this.db.query.plans.findFirst({ where: eq(plans.id, id) });
  }
  async getFirstPlan() {
    return this.db.query.plans.findFirst({ orderBy: [plans.createdAt] });
  }
  async createPlan(data: Partial<Plan>): Promise<Plan> {
    const [row] = await this.db.insert(plans).values(data as any).returning();
    return row;
  }
  async updatePlan(id: string, data: Partial<Plan>) {
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
  async paginateUsersAdmin(search: string, limit: number, offset: number) {
    const where = search
      ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`), ilike(tenants.name, `%${search}%`))
      : undefined;

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
}