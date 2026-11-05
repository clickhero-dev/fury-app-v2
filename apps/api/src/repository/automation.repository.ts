import {
  db as defaultDb,
  type Database,
  automationRules,
  furyInsights,
} from '@fury/db';
import { and, desc, eq } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type AutomationRule = typeof automationRules.$inferSelect;

/**
 * Repositório do domínio **Automação (regras de automação)**.
 * Agregado: `automationRules` (+ `furyInsights` smart_takedowns). ADR-0001.
 */
export class AutomationRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  async findAutomationRuleByName(name: string) {
    return this.db.query.automationRules.findFirst({
      where: and(eq(automationRules.tenantId, this.tenantId), eq(automationRules.name, name)),
    });
  }

  async findAutomationRuleById(id: string) {
    return this.db.query.automationRules.findFirst({
      where: and(eq(automationRules.id, id), eq(automationRules.tenantId, this.tenantId)),
    });
  }

  async createAutomationRule(data: Partial<AutomationRule>): Promise<AutomationRule> {
    const [row] = await this.db.insert(automationRules).values({ ...data, tenantId: this.tenantId } as any).returning();
    return row;
  }

  async updateAutomationRule(id: string, data: Partial<AutomationRule>) {
    const [row] = await this.db.update(automationRules).set(data as any).where(and(eq(automationRules.id, id), eq(automationRules.tenantId, this.tenantId))).returning();
    return row ?? null;
  }

  async deleteAutomationRule(id: string) {
    await this.db.delete(automationRules).where(and(eq(automationRules.id, id), eq(automationRules.tenantId, this.tenantId)));
  }

  async listAutomationRules() {
    return this.db.query.automationRules.findMany({ where: eq(automationRules.tenantId, this.tenantId) });
  }

  /** Smart takedowns (furyInsights) do tenant. */
  async listSmartTakedowns() {
    return this.db.query.furyInsights.findMany({
      where: and(eq(furyInsights.tenantId, this.tenantId), eq(furyInsights.suggestionType, 'smart_takedown')),
      orderBy: [desc(furyInsights.createdAt)],
      limit: 20,
    });
  }
}