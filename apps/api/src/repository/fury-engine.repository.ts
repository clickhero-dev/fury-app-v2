import {
  db as defaultDb,
  type Database,
  furyConfig,
  performanceRules,
  performanceScores,
  ruleExecutions,
} from '@fury/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type PerformanceRule = typeof performanceRules.$inferSelect;
type FuryConfig = typeof furyConfig.$inferSelect;

/**
 * Repositório do domínio **FuryEngine / insights + performance**.
 * Agregado: `furyConfig` + `performanceRules` + `performanceScores` + `ruleExecutions`. ADR-0001.
 */
export class FuryEngineRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  // ── Fury config ──────────────────────────────────────────────────

  async findFuryConfigByTenant() {
    return this.db.query.furyConfig.findFirst({ where: eq(furyConfig.tenantId, this.tenantId) });
  }

  /** Config do tenant, criando default se não existir (GET /config). */
  async findOrCreateFuryConfig(): Promise<FuryConfig> {
    const existing = await this.findFuryConfigByTenant();
    if (existing) return existing;
    const [row] = await this.db.insert(furyConfig).values({ tenantId: this.tenantId }).returning();
    return row;
  }

  /** Upsert da config (PATCH /config). */
  async upsertFuryConfig(updates: Partial<FuryConfig>): Promise<FuryConfig | null> {
    const existing = await this.findFuryConfigByTenant();
    if (existing) {
      const [row] = await this.db.update(furyConfig).set(updates as any).where(eq(furyConfig.tenantId, this.tenantId)).returning();
      return row;
    }
    const [row] = await this.db.insert(furyConfig).values({ tenantId: this.tenantId, ...updates } as any).returning();
    return row;
  }

  // ── Performance rules ────────────────────────────────────────────

  async listPerformanceRules() {
    return this.db.query.performanceRules.findMany({
      where: eq(performanceRules.tenantId, this.tenantId),
      orderBy: [desc(performanceRules.createdAt)],
    });
  }

  /** Regras ativas (usado pelo avaliador de regras). */
  async findActiveRules() {
    return this.db.query.performanceRules.findMany({
      where: and(eq(performanceRules.tenantId, this.tenantId), eq(performanceRules.isActive, true)),
    });
  }

  async createPerformanceRule(data: Partial<PerformanceRule>): Promise<PerformanceRule> {
    const [row] = await this.db.insert(performanceRules).values({ ...data, tenantId: this.tenantId } as any).returning();
    return row;
  }

  async findPerformanceRuleById(id: string) {
    return this.db.query.performanceRules.findFirst({
      where: and(eq(performanceRules.id, id), eq(performanceRules.tenantId, this.tenantId)),
    });
  }

  async updatePerformanceRule(id: string, data: Partial<PerformanceRule>) {
    const [row] = await this.db.update(performanceRules).set(data as any).where(and(eq(performanceRules.id, id), eq(performanceRules.tenantId, this.tenantId))).returning();
    return row ?? null;
  }

  async deletePerformanceRule(id: string) {
    await this.db.delete(performanceRules).where(and(eq(performanceRules.id, id), eq(performanceRules.tenantId, this.tenantId)));
  }

  // ── Performance scores ───────────────────────────────────────────

  async listPerformanceScores(campaignId?: string) {
    return this.db.query.performanceScores.findMany({
      where: campaignId
        ? and(eq(performanceScores.tenantId, this.tenantId), eq(performanceScores.campaignId, campaignId))
        : eq(performanceScores.tenantId, this.tenantId),
      orderBy: [desc(performanceScores.computedAt)],
      limit: 100,
    });
  }

  async createPerformanceScore(data: Partial<typeof performanceScores.$inferInsert>) {
    const [row] = await this.db.insert(performanceScores).values({ ...data, tenantId: this.tenantId } as any).returning();
    return row;
  }

  // ── Rule executions ──────────────────────────────────────────────

  async listRuleExecutions(ruleIds: string[], ruleId?: string, campaignId?: string) {
    return this.db.query.ruleExecutions.findMany({
      where: and(
        inArray(ruleExecutions.ruleId, ruleIds),
        ...(ruleId ? [eq(ruleExecutions.ruleId, ruleId)] : []),
        ...(campaignId ? [eq(ruleExecutions.campaignId, campaignId)] : []),
      ),
      orderBy: [desc(ruleExecutions.triggeredAt)],
    });
  }

  async createRuleExecution(data: Partial<typeof ruleExecutions.$inferInsert>) {
    const [row] = await this.db.insert(ruleExecutions).values({ ...data, tenantId: this.tenantId } as any).returning();
    return row;
  }
}