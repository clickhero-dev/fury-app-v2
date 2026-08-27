import { AppError } from '../../middleware/errorHandler.js';
import { AutomationRepository } from '../../repository/automation.repository.js';

export async function createAutomationRule(args: {
  tenantId: string;
  name: string;
  description?: string;
  trigger: string;
  threshold: number;
  action: string;
  enabled?: boolean;
}) {
  if (args.threshold < 0) {
    throw new AppError(400, 'INVALID_THRESHOLD', 'Threshold cannot be negative');
  }

  const rule = await new AutomationRepository(args.tenantId).createAutomationRule({
    name: args.name,
    description: args.description,
    trigger: args.trigger,
    ruleType: args.trigger,
    threshold: args.threshold.toString(),
    action: args.action,
    isActive: args.enabled ?? true,
  });

  return rule;
}

export async function getAutomationRules(tenantId: string) {
  const rules = await new AutomationRepository(tenantId).listAutomationRules();

  return rules.map((rule) => ({
    ...rule,
    threshold: parseInt(rule.threshold, 10),
    enabled: rule.isActive,
  }));
}