import { AppError } from '../../middleware/errorHandler.js';
import { AutomationRepository } from '../../repository/automation.repository.js';

export class AutomationService {
  constructor(
    private repoFactory: (tenantId: string) => AutomationRepository = (t) => new AutomationRepository(t),
  ) {}

  private repo(tenantId: string): AutomationRepository {
    return this.repoFactory(tenantId);
  }

  async createAutomationRule(args: { tenantId: string; name: string; description?: string; trigger: string; threshold: number; action: string; enabled?: boolean }) {
    if (args.threshold < 0) throw new AppError(400, 'INVALID_THRESHOLD', 'Threshold cannot be negative');
    return this.repo(args.tenantId).createAutomationRule({
      name: args.name,
      description: args.description,
      trigger: args.trigger,
      ruleType: args.trigger,
      threshold: args.threshold.toString(),
      action: args.action,
      isActive: args.enabled ?? true,
    });
  }

  async getAutomationRules(tenantId: string) {
    const rules = await this.repo(tenantId).listAutomationRules();
    return rules.map((rule) => ({ ...rule, threshold: parseInt(rule.threshold, 10), enabled: rule.isActive }));
  }
}