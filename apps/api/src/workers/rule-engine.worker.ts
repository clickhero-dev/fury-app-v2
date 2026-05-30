import { Worker, type Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { db, performanceRules, campaigns, furyInsights, tenants } from '@fury/db';
import { emitToTenant } from '../lib/sse.js';
import { createBullConnection, RULE_ENGINE_QUEUE_NAME, type RuleEngineJobPayload } from '../lib/queue.js';

interface RuleCheckResult {
  ruleId: string;
  ruleName: string;
  campaignId: string;
  campaignName: string;
  triggered: boolean;
  reason?: string;
  metrics?: Record<string, unknown>;
}

interface ProcessingStats {
  tenantsProcessed: number;
  rulesChecked: number;
  triggeredCount: number;
  errors: Array<{ tenantId: string; error: string }>;
}

async function checkCampaignAgainstRule(
  rule: typeof performanceRules.$inferSelect,
  campaign: typeof campaigns.$inferSelect
): Promise<RuleCheckResult> {
  const metrics = campaign.metrics as Record<string, unknown> || {};
  const conditionValue = parseFloat(rule.conditionValue.toString());

  const result: RuleCheckResult = {
    ruleId: rule.id,
    ruleName: rule.name,
    campaignId: campaign.id,
    campaignName: campaign.name,
    triggered: false,
    metrics,
  };

  const fieldValue = typeof metrics[rule.conditionField] === 'number'
    ? (metrics[rule.conditionField] as number)
    : parseFloat(String(metrics[rule.conditionField] || 0));

  let conditionMet = false;

  if (rule.conditionOperator === 'gt') {
    conditionMet = fieldValue > conditionValue;
  } else if (rule.conditionOperator === 'lt') {
    conditionMet = fieldValue < conditionValue;
  } else if (rule.conditionOperator === 'eq') {
    conditionMet = fieldValue === conditionValue;
  }

  if (conditionMet) {
    result.triggered = true;
    result.reason = `${rule.conditionField} ${fieldValue.toFixed(2)} ${rule.conditionOperator} ${conditionValue.toFixed(2)}`;
  }

  return result;
}

async function recordInsight(
  tenantId: string,
  campaignId: string,
  ruleId: string,
  ruleName: string,
  reason: string,
  metrics: Record<string, unknown>
): Promise<void> {
  await db.insert(furyInsights).values({
    tenantId,
    campaignId,
    suggestionType: 'smart_takedown',
    suggestionData: {
      ruleId,
      ruleName,
      reason,
      metrics,
      detectedAt: new Date().toISOString(),
    },
  });
}

async function processTenant(
  tenantId: string,
  stats: ProcessingStats
): Promise<void> {
  try {
    const rules = await db.query.performanceRules.findMany({
      where: and(
        eq(performanceRules.tenantId, tenantId),
        eq(performanceRules.isActive, true)
      ),
    });

    if (rules.length === 0) {
      return;
    }

    stats.tenantsProcessed++;

    const campaignsList = await db.query.campaigns.findMany({
      where: eq(campaigns.tenantId, tenantId),
    });

    for (const rule of rules) {
      stats.rulesChecked++;

      for (const campaign of campaignsList) {
        const checkResult = await checkCampaignAgainstRule(rule, campaign);

        if (checkResult.triggered && checkResult.reason) {
          stats.triggeredCount++;

          await recordInsight(
            tenantId,
            campaign.id,
            rule.id,
            rule.name,
            checkResult.reason,
            checkResult.metrics || {}
          );

          const insight = {
            id: crypto.randomUUID(),
            ruleId: rule.id,
            ruleName: rule.name,
            campaignId: campaign.id,
            campaignName: campaign.name,
            reason: checkResult.reason,
            action: rule.action,
            timestamp: new Date().toISOString(),
          };

          emitToTenant(tenantId, 'rule_triggered', insight);

          console.info('Rule triggered', {
            tenantId,
            ruleId: rule.id,
            ruleName: rule.name,
            campaignId: campaign.id,
            campaignName: campaign.name,
            reason: checkResult.reason,
          });
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    stats.errors.push({ tenantId, error: errorMessage });
    console.error('Error processing tenant in rule engine:', { tenantId, error: errorMessage });
  }
}

async function processJob(job: Job<RuleEngineJobPayload>): Promise<ProcessingStats> {
  console.info('Rule engine job started', { jobId: job.id, timestamp: job.data.timestamp });

  const stats: ProcessingStats = {
    tenantsProcessed: 0,
    rulesChecked: 0,
    triggeredCount: 0,
    errors: [],
  };

  try {
    const allTenants = await db.query.tenants.findMany();

    for (const tenant of allTenants) {
      await processTenant(tenant.id, stats);
    }

    console.info('Rule engine job completed', {
      jobId: job.id,
      ...stats,
    });
  } catch (error) {
    console.error('Critical error in rule engine job:', error);
    throw error;
  }

  return stats;
}

export async function startRuleEngineWorker(): Promise<Worker<RuleEngineJobPayload>> {
  const connection = await createBullConnection();

  const worker = new Worker<RuleEngineJobPayload>(RULE_ENGINE_QUEUE_NAME, processJob, {
    connection,
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    console.log('Rule engine job completed', {
      jobId: job.id,
      stats: result,
    });
  });

  worker.on('failed', (job, error) => {
    console.error('Rule engine job failed', {
      jobId: job?.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  console.log('✅ Rule engine worker started');
  return worker;
}

export { RULE_ENGINE_QUEUE_NAME };
