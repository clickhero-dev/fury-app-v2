import { Worker, Queue } from 'bullmq';
import { getWorkerMetricsOptions } from '../lib/worker-metrics.js';
import { db, metaLeads } from '../lib/db.js';
import { MetaSyncRepository } from '../repository/meta-sync.repository.js';
import { captureServerEvent } from '../lib/analytics.js';
import { replaceLegacyRepeatablesWithScheduler } from '../lib/job-scheduler.js';

export const LEAD_STATUS_QUEUE_NAME = 'lead-status';

/** Janela de envelhecimento: 2 dias (regra: 1º dia novo, 2º dia não contatado). */
export const STALE_AFTER_DAYS = 2;

/** Tenants que possuem leads — alvo do processamento diário. */
export async function getTenantIdsWithLeads(): Promise<string[]> {
  const rows = await db
    .select({ tenantId: metaLeads.tenantId })
    .from(metaLeads)
    .groupBy(metaLeads.tenantId);
  return rows.map((r) => r.tenantId);
}

/**
 * Regra automática: leads com status `novo` criados antes do cutoff viram
 * `não contatado`. Roda por tenant; captura telemetria com o total.
 */
export async function processLeadStatusRun(cutoff?: Date): Promise<void> {
  const tenantIds = await getTenantIdsWithLeads();
  const deadline = cutoff ?? new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  let updated = 0;
  for (const tenantId of tenantIds) {
    const repo = new MetaSyncRepository(tenantId);
    updated += await repo.markStaleNewLeadsAsNotContacted(deadline);
  }

  captureServerEvent('lead_status_stale_marked', {
    updated,
    tenants: tenantIds.length,
    cutoff: deadline.toISOString(),
  });
}

let leadStatusWorkerInstance: Worker | null = null;
let leadStatusQueueInstance: Queue | null = null;

export async function startLeadStatusWorker(): Promise<Worker> {
  const worker = new Worker(
    LEAD_STATUS_QUEUE_NAME,
    async (job) => {
      if (
        job.name === 'worker-crm-leads-mark-stale' ||
        job.name === 'cron-crm-leads-mark-stale' ||
        job.name === 'worker:crm:refresh_lead_status' ||
        job.name === 'cron:crm:refresh_lead_status' ||
        job.name === 'lead-status:run' ||
        job.name === 'lead-status:cron'
      ) {
        const cutoff = job.data.cutoff ? new Date(job.data.cutoff) : undefined;
        await processLeadStatusRun(cutoff);
      } else {
        throw new Error(`Unsupported lead status job: ${job.name}`);
      }
    },
    {
      connection: (await import('../lib/redis.js')).getRedis().duplicate(),
      concurrency: 1,
      ...getWorkerMetricsOptions('lead-status-worker'),
    }
  );

  worker.on('error', (err) => {
    console.error('[lead-status] Worker error:', err.message);
  });

  leadStatusWorkerInstance = worker;
  return worker;
}

export async function stopLeadStatusWorker(): Promise<void> {
  if (leadStatusWorkerInstance) {
    await leadStatusWorkerInstance.close();
    leadStatusWorkerInstance = null;
    console.log('🛑 Lead-status worker stopped');
  }
}

/** Agenda o cron diário às 03:00 (jobId determinístico — dedupe multi-pod). */
export async function startLeadStatusManager(): Promise<void> {
  const { getRedisConnection } = await import('../lib/queue.js');
  const connection = await getRedisConnection();
  await startLeadStatusWorker();
  const queue = new Queue(LEAD_STATUS_QUEUE_NAME, { connection });
  leadStatusQueueInstance = queue;

  await replaceLegacyRepeatablesWithScheduler(
    queue,
    ['lead-status:cron'],
    ['lead-status-daily'],
    'cron-crm-leads-mark-stale-daily-0300-utc',
    { pattern: '0 3 * * *', tz: 'UTC' },
    {
      name: 'cron-crm-leads-mark-stale',
      data: { cutoff: null },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
    },
  );

  console.log('✅ Lead-status scheduler started (daily 03:00)');
}

/** Encerra consumidor e produtor antes do Redis no shutdown da API. */
export async function stopLeadStatusManager(): Promise<void> {
  await stopLeadStatusWorker();
  if (leadStatusQueueInstance) {
    await leadStatusQueueInstance.close();
    leadStatusQueueInstance = null;
  }
}
