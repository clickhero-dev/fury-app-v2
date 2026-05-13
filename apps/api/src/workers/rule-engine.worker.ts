import { Worker, type Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { db, automationRules, campaigns, furyInsights, tenants } from '@fury/db';
import { emitToTenant } from '../lib/sse.js';
import { createBullConnection, RULE_ENGINE_QUEUE_NAME, type RuleEngineJobPayload } from '../lib/queue.js';

interface RuleCheckResult {
  ruleId: string;
  ruleType: string;
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
  rule: typeof automationRules.$inferSelect,
  campaign: typeof campaigns.$inferSelect
): Promise<RuleCheckResult> {
  const metrics = campaign.metrics as Record<string, unknown> || {};
  const threshold = parseFloat(rule.threshold.toString());

  const result: RuleCheckResult = {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    campaignId: campaign.id,
    campaignName: campaign.name,
    triggered: false,
    metrics,
  };

  if (rule.ruleType === 'pause_high_cpa') {
    const cpa = typeof metrics.cpa === 'number' ? metrics.cpa : parseFloat(String(metrics.cpa || 0));
    if (cpa > threshold) {
      result.triggered = true;
      result.reason = `CPA ${cpa.toFixed(2)} exceeds threshold ${threshold.toFixed(2)}`;
    }
  } else if (rule.ruleType === 'pause_low_roas') {
    const roas = typeof metrics.roas === 'number' ? metrics.roas : parseFloat(String(metrics.roas || 0));
    if (roas < threshold) {
      result.triggered = true;
      result.reason = `ROAS ${roas.toFixed(2)} below threshold ${threshold.toFixed(2)}`;
    }
  } else if (rule.ruleType === 'pause_zero_conversions') {
    const conversions = typeof metrics.conversions === 'number' ? metrics.conversions : parseInt(String(metrics.conversions || 0), 10);
    if (conversions === 0) {
      result.triggered = true;
      result.reason = 'Zero conversions detected';
    }
  } else if (rule.ruleType === 'budget_limit') {
    const spend = typeof metrics.spend === 'number' ? metrics.spend : parseFloat(String(metrics.spend || 0));
    const budget = campaign.budget as Record<string, unknown> || {};
    const dailyBudget = typeof budget.dailyBudget === 'number' ? budget.dailyBudget : parseFloat(String(budget.dailyBudget || 0));

    if (dailyBudget > 0 && spend > dailyBudget * 1.1) {
      result.triggered = true;
      result.reason = `Spend ${spend.toFixed(2)} exceeds budget limit ${(dailyBudget * 1.1).toFixed(2)}`;
    }
  }

  return result;
}

async function recordInsight(
  tenantId: string,
  campaignId: string,
  ruleId: string,
  ruleType: string,
  reason: string,
  metrics: Record<string, unknown>
): Promise<void> {
  await db.insert(furyInsights).values({
    tenantId,
    campaignId,
    suggestionType: 'smart_takedown',
    suggestionData: {
      ruleId,
      ruleType,
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
    const rules = await db.query.automationRules.findMany({
      where: and(
        eq(automationRules.tenantId, tenantId),
        eq(automationRules.isActive, true)
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
            rule.ruleType,
            checkResult.reason,
            checkResult.metrics || {}
          );

          const insight = {
            id: crypto.randomUUID(),
            ruleId: rule.id,
            ruleType: rule.ruleType,
            campaignId: campaign.id,
            campaignName: campaign.name,
            reason: checkResult.reason,
            action: rule.action,
            timestamp: new Date().toISOString(),
            // TODO: Integrate with PATCH /api/campaigns/:id/pause endpoint when available
            // Currently only emitting notification and recording insight
          };

          emitToTenant(tenantId, 'rule_triggered', insight);

          console.info('Rule triggered', {
            tenantId,
            ruleId: rule.id,
            ruleType: rule.ruleType,
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
