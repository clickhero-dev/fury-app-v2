import { Worker, Queue } from 'bullmq';
import { db, metaLeads } from '../lib/db.js';
import { MetaSyncRepository } from '../repository/meta-sync.repository.js';
import { captureServerEvent } from '../lib/analytics.js';

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
      if (job.name === 'lead-status:run' || job.name === 'lead-status:cron') {
        const cutoff = job.data.cutoff ? new Date(job.data.cutoff) : undefined;
        await processLeadStatusRun(cutoff);
      }
    },
    {
      connection: (await import('../lib/redis.js')).getRedis().duplicate(),
      concurrency: 1,
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

  await queue.add(
    'lead-status:cron',
    { cutoff: null },
    {
      repeat: { pattern: '0 3 * * *', tz: 'UTC' },
      jobId: 'lead-status-cron',
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    }
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
