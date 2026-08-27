import {
  db as defaultDb,
  type Database,
  subscriptions,
  plans,
  invoices,
  budgetOptimizations,
  creativeAssets,
} from '@fury/db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type Subscription = typeof subscriptions.$inferSelect;

/**
 * Repositório do domínio **Billing / Assinaturas / Quota**.
 * Agregado: `subscriptions` + `invoices` + `plans` + `budgetOptimizations` (+ quota
 * criativos/modificações). ADR-0001.
 *
 * Métodos marcados como GLOBAL (catálogo de planos e fluxo do webhook do Asaas)
 * não são escopados por tenant — o construtor aceita placeholder `''` para esses.
 */
export class SubscriptionRepository extends TenantScopedRepository {
  constructor(tenantId: string = '', db: Database = defaultDb) {
    super(tenantId, db);
  }

  // ── Assinatura (tenant) ───────────────────────────────────────────

  async findSubscription() {
    return this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.tenantId, this.tenantId),
      orderBy: [desc(subscriptions.createdAt)],
    });
  }

  async findActiveSubscription() {
    return this.db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.tenantId, this.tenantId),
        inArray(subscriptions.status, ['active', 'trial']),
      ),
    });
  }

  async createSubscription(data: Partial<Subscription>): Promise<Subscription> {
    const [row] = await this.db.insert(subscriptions).values(data as any).returning();
    return row;
  }

  // ── Assinatura (GLOBAL / webhook Asaas) ───────────────────────────

  async findSubscriptionByAsaasId(asaasSubscriptionId: string) {
    return this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.asaasSubscriptionId, asaasSubscriptionId),
    });
  }

  async patchSubscription(id: string, data: Partial<Subscription>) {
    const [row] = await this.db.update(subscriptions).set({ ...data, updatedAt: new Date() } as any).where(eq(subscriptions.id, id)).returning();
    return row ?? null;
  }

  // ── Planos (catálogo GLOBAL + plano do tenant) ────────────────────

  async listActivePlans() {
    return this.db.query.plans.findMany({
      where: eq(plans.isActive, true),
      orderBy: [plans.priceCents],
    });
  }

  async findPlanById(id: string, activeOnly = false) {
    const filters = [eq(plans.id, id)];
    if (activeOnly) filters.push(eq(plans.isActive, true));
    return this.db.query.plans.findFirst({ where: and(...filters) });
  }

  // ── Invoices ─────────────────────────────────────────────────────

  async findInvoiceByPaymentId(paymentId: string) {
    return this.db.query.invoices.findFirst({ where: eq(invoices.asaasPaymentId, paymentId) });
  }

  async createInvoice(data: Partial<typeof invoices.$inferInsert>) {
    const [row] = await this.db.insert(invoices).values(data as any).returning();
    return row;
  }

  async patchInvoice(id: string, data: Partial<typeof invoices.$inferInsert>) {
    await this.db.update(invoices).set(data as any).where(eq(invoices.id, id));
  }

  async findInvoicesByTenant(limit = 12) {
    return this.db.query.invoices.findMany({
      where: eq(invoices.tenantId, this.tenantId),
      orderBy: [desc(invoices.createdAt)],
      limit,
    });
  }

  async findRecentInvoicesBySubscription(subscriptionId: string, limit = 12) {
    return this.db.query.invoices.findMany({
      where: eq(invoices.subscriptionId, subscriptionId),
      orderBy: [desc(invoices.createdAt)],
      limit,
    });
  }

  // ── Budget optimization ──────────────────────────────────────────

  async createBudgetOptimization(data: Partial<typeof budgetOptimizations.$inferInsert>) {
    const [row] = await this.db.insert(budgetOptimizations).values(data as any).returning();
    return row;
  }

  // ── Quota de criativos (subscription) ────────────────────────────

  /** Consome 1 unidade da cota mensal de criativos. Retorna false se estourou o limite. */
  async consumeCreativeQuota(): Promise<boolean> {
    const sub = await this.findSubscription();
    if (!sub || sub.creativesRemaining === null) return true;
    const updated = await this.db
      .update(subscriptions)
      .set({ creativesRemaining: sql`${subscriptions.creativesRemaining} - 1`, updatedAt: new Date() })
      .where(and(eq(subscriptions.id, sub.id), sql`${subscriptions.creativesRemaining} > 0`))
      .returning({ id: subscriptions.id });
    return updated.length > 0;
  }

  async refundCreativeQuota() {
    const sub = await this.findSubscription();
    if (!sub || sub.creativesRemaining === null) return;
    await this.db
      .update(subscriptions)
      .set({ creativesRemaining: sql`${subscriptions.creativesRemaining} + 1`, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
  }

  // ── Quota de modificações (creativeAssets) ────────────────────────

  /** Consome 1 modificação do criativo raiz. Retorna false se atingiu o teto. */
  async consumeModificationQuota(rootAssetId: string): Promise<boolean> {
    const root = await this.db.query.creativeAssets.findFirst({ where: eq(creativeAssets.id, rootAssetId) });
    if (!root || root.modificationsRemaining === null) return true;
    const updated = await this.db
      .update(creativeAssets)
      .set({ modificationsRemaining: sql`${creativeAssets.modificationsRemaining} - 1` })
      .where(and(eq(creativeAssets.id, rootAssetId), sql`${creativeAssets.modificationsRemaining} > 0`))
      .returning({ id: creativeAssets.id });
    return updated.length > 0;
  }

  async refundModificationQuota(rootAssetId: string) {
    const root = await this.db.query.creativeAssets.findFirst({ where: eq(creativeAssets.id, rootAssetId) });
    if (!root || root.modificationsRemaining === null) return;
    await this.db
      .update(creativeAssets)
      .set({ modificationsRemaining: sql`${creativeAssets.modificationsRemaining} + 1` })
      .where(eq(creativeAssets.id, rootAssetId));
  }

  // ── Snapshots de quota / plano ───────────────────────────────────

  /** Teto de modificações do plano vigente do tenant — "congela" no criativo ao criá-lo. */
  async getModificationsPerCreativeLimit(): Promise<number | null> {
    const sub = await this.findSubscription();
    if (!sub) return null;
    const plan = await this.findPlanById(sub.planId);
    return readLimits(plan?.limits)?.modificationsPerCreative ?? null;
  }

  async getCreativeQuotaSnapshot(): Promise<{ creativesRemaining: number | null; creativesLimit: number | null }> {
    const sub = await this.findSubscription();
    if (!sub) return { creativesRemaining: null, creativesLimit: null };
    const plan = await this.findPlanById(sub.planId);
    return {
      creativesRemaining: sub.creativesRemaining,
      creativesLimit: readLimits(plan?.limits)?.creativesPerMonth ?? null,
    };
  }
}

function readLimits(rawLimits: unknown): { creativesPerMonth?: number | null; modificationsPerCreative?: number | null } {
  return (rawLimits as any ?? {});
}