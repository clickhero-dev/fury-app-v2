import { AppError } from '../../middleware/errorHandler.js';
import { FuryEngineRepository } from '../../repository/fury-engine.repository.js';

type RuleRepo = FuryEngineRepository;

export interface ConfigPayload {
  targetRoas?: number;
  targetCpa?: number;
  targetCtr?: number;
  targetBudgetUtilization?: number;
}

export interface RulePayload {
  name: string;
  conditionField: string;
  conditionOperator: string;
  conditionValue: number;
  action: string;
  actionValue?: number;
  isActive?: boolean;
}

export class FuryEngineService {
  constructor(
    private repoFactory: (tenantId: string) => RuleRepo = (t) => new FuryEngineRepository(t),
  ) {}

  private repo(tenantId: string): RuleRepo {
    return this.repoFactory(tenantId);
  }

  async getConfig(tenantId: string) {
    return this.repo(tenantId).findOrCreateFuryConfig();
  }

  /** Atualiza config convertendo números → strings (formato de armazenamento). */
  async updateConfig(tenantId: string, payload: ConfigPayload) {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (payload.targetRoas !== undefined) updates.targetRoas = String(payload.targetRoas);
    if (payload.targetCpa !== undefined) updates.targetCpa = String(payload.targetCpa);
    if (payload.targetCtr !== undefined) updates.targetCtr = String(payload.targetCtr);
    if (payload.targetBudgetUtilization !== undefined) updates.targetBudgetUtilization = String(payload.targetBudgetUtilization);
    return this.repo(tenantId).upsertFuryConfig(updates);
  }

  async listRules(tenantId: string) {
    return this.repo(tenantId).listPerformanceRules();
  }

  async createRule(tenantId: string, payload: RulePayload) {
    const created = await this.repo(tenantId).createPerformanceRule({
      name: payload.name,
      conditionField: payload.conditionField as any,
      conditionOperator: payload.conditionOperator as any,
      conditionValue: String(payload.conditionValue),
      action: payload.action as any,
      actionValue: payload.actionValue !== undefined ? String(payload.actionValue) : undefined,
      isActive: payload.isActive ?? true,
    });
    return created;
  }

  async updateRule(tenantId: string, id: string, payload: Partial<RulePayload>) {
    const repo = this.repo(tenantId);
    const existing = await repo.findPerformanceRuleById(id);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Rule not found');

    const updates: Record<string, any> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.conditionField !== undefined) updates.conditionField = payload.conditionField;
    if (payload.conditionOperator !== undefined) updates.conditionOperator = payload.conditionOperator;
    if (payload.conditionValue !== undefined) updates.conditionValue = String(payload.conditionValue);
    if (payload.action !== undefined) updates.action = payload.action;
    if (payload.actionValue !== undefined) updates.actionValue = String(payload.actionValue);
    if (payload.isActive !== undefined) updates.isActive = payload.isActive;

    return repo.updatePerformanceRule(id, updates);
  }

  async deleteRule(tenantId: string, id: string) {
    const repo = this.repo(tenantId);
    const existing = await repo.findPerformanceRuleById(id);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Rule not found');
    await repo.deletePerformanceRule(id);
  }

  async listScores(tenantId: string, campaignId?: string) {
    return this.repo(tenantId).listPerformanceScores(campaignId);
  }

  async listHistory(
    tenantId: string,
    filters?: { ruleId?: string; campaignId?: string },
  ) {
    const repo = this.repo(tenantId);
    const rules = await repo.listPerformanceRules();
    const ids = rules.map((r) => r.id);
    if (ids.length === 0) return [];
    return repo.listRuleExecutions(ids, filters?.ruleId, filters?.campaignId);
  }
}