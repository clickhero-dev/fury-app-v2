import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db, campaigns, tenants } from '@fury/db';
import { emitToTenant } from '../lib/sse.js';
import { createBullConnection, FURY_ENGINE_QUEUE_NAME, type FuryEngineJobPayload } from '../lib/queue.js';
import { calculateScore, getGrade, evaluateRules, computeAndSaveScore, type CampaignMetrics } from '../services/fury-engine.service.js';

interface FuryJobResult {
  tenantsProcessed: number;
  campaignsScored: number;
  errors: Array<{ tenantId: string; error: string }>;
}

async function processTenant(tenantId: string, stats: FuryJobResult): Promise<void> {
  try {
    const activeCampaigns = await db.query.campaigns.findMany({
      where: eq(campaigns.tenantId, tenantId),
    });

    const active = activeCampaigns.filter((c: typeof activeCampaigns[number]) => c.status === 'active');
    if (active.length === 0) return;

    stats.tenantsProcessed++;

    const scores: Array<{ campaignId: string; campaignName: string; score: number; grade: string }> = [];

    for (const campaign of active) {
      const metrics = (campaign.metrics ?? {}) as CampaignMetrics;

      const { score, grade } = await computeAndSaveScore(tenantId, campaign.id, metrics);
      await evaluateRules(tenantId, campaign.id, metrics);

      scores.push({ campaignId: campaign.id, campaignName: campaign.name, score, grade });
      stats.campaignsScored++;
    }

    emitToTenant(tenantId, 'fury:update', {
      timestamp: new Date().toISOString(),
      scores,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    stats.errors.push({ tenantId, error: msg });
    console.error('[fury-engine] Error processing tenant', { tenantId, error: msg });
  }
}

async function processJob(job: Job<FuryEngineJobPayload>): Promise<FuryJobResult> {
  console.info('[fury-engine] Job started', { jobId: job.id, timestamp: job.data.timestamp });

  const stats: FuryJobResult = { tenantsProcessed: 0, campaignsScored: 0, errors: [] };

  const allTenants = await db.query.tenants.findMany();
  for (const tenant of allTenants) {
    await processTenant(tenant.id, stats);
  }

  console.info('[fury-engine] Job completed', { jobId: job.id, ...stats });
  return stats;
}

export async function startFuryEngineWorker(): Promise<Worker<FuryEngineJobPayload>> {
  const connection = await createBullConnection();

  const worker = new Worker<FuryEngineJobPayload>(FURY_ENGINE_QUEUE_NAME, processJob, {
    connection,
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    console.log('[fury-engine] Job completed', { jobId: job.id, stats: result });
  });

  worker.on('failed', (job, error) => {
    console.error('[fury-engine] Job failed', {
      jobId: job?.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  console.log('✅ Fury engine worker started');
  return worker;
}
