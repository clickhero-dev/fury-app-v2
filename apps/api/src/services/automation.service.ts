import { eq } from 'drizzle-orm';
import { db, automationRules } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';

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

  const [rule] = await db
    .insert(automationRules)
    .values({
      tenantId: args.tenantId,
      name: args.name,
      description: args.description,
      trigger: args.trigger,
      threshold: args.threshold.toString(),
      action: args.action,
      enabled: (args.enabled !== false).toString(),
    })
    .returning();

  return rule;
}

export async function getAutomationRules(tenantId: string) {
  const rules = await db.query.automationRules.findMany({
    where: eq(automationRules.tenantId, tenantId),
  });

  return rules.map((rule) => ({
    ...rule,
    threshold: parseInt(rule.threshold, 10),
    enabled: rule.enabled === 'true',
  }));
}
