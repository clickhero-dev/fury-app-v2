import { Worker } from 'bullmq';
import { db, metaConnections } from '../lib/db.js';
import { getMetaSyncQueue } from '../lib/queue.js';
import { metaSyncService } from '../services/meta/meta-sync.service.js';
import { notifyMetaSyncFailure } from '../lib/meta-sync-alerts.js';

export const META_SYNC_QUEUE_NAME = 'meta-sync';

/** Janela de 15min (ciclo) a partir de um timestamp — chave do jobId determinístico. */
export function windowKeyFor(timestamp: string): string {
  const t = new Date(timestamp);
  const slot = Math.floor(t.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000;
  return new Date(slot).toISOString().slice(0, 16);
}

/** Tenants com conexão Meta — alvo do sync periódico (leitura via lib/db). */
export async function getMetaSyncTenantIds(): Promise<string[]> {
  const rows = await db.select({ tenantId: metaConnections.tenantId }).from(metaConnections);
  return rows.map((r) => r.tenantId);
}

/**
 * Enfileira um job `meta-sync:run` por tenant com jobId determinístico
 * (tenant + ciclo de 15min) — dedupe multi-pod via BullMQ.
 */
export async function enqueueMetaSyncRuns(
  timestamp: string,
  queue: { add: (...args: any[]) => Promise<unknown> }
): Promise<void> {
  const tenantIds = await getMetaSyncTenantIds();
  const windowKey = windowKeyFor(timestamp);
  for (const tenantId of tenantIds) {
    await queue.add(
      'meta-sync:run',
      { tenantId, reason: 'scheduled' },
      { jobId: `meta-sync:${tenantId}:${windowKey}` }
    );
  }
}

/** Processa um run de um tenant; run failed → email de alerta (dedupe 6h). */
export async function processMetaSyncRun(tenantId: string, reason: string): Promise<void> {
  const result = await metaSyncService.syncTenant({ tenantId, reason });
  if (result.status === 'failed' && result.errorCode) {
    await notifyMetaSyncFailure({
      tenantId,
      errorCode: result.errorCode,
      message: result.errorMessage ?? '',
    });
  }
}

let metaSyncWorkerInstance: Worker<{ tenantId: string; reason?: string; timestamp?: string }> | null = null;

export async function startMetaSyncWorker(): Promise<Worker> {
  const worker = new Worker<{ tenantId: string; reason?: string; timestamp?: string }>(
    META_SYNC_QUEUE_NAME,
    async (job) => {
      if (job.name === 'meta-sync:run') {
        const { tenantId, reason } = job.data;
        await processMetaSyncRun(tenantId, reason ?? 'scheduled');
      } else {
        // 'meta-sync:tick' / 'meta-sync:bootstrap' → enfileira runs por tenant.
        const ts = job.data.timestamp ?? new Date().toISOString();
        const queue = await getMetaSyncQueue();
        await enqueueMetaSyncRuns(ts, queue);
      }
    },
    {
      connection: (await import('../lib/redis.js')).getRedis().duplicate(),
      concurrency: 2,
    }
  );

  worker.on('error', (err) => {
    console.error('[meta-sync] Worker error:', err.message);
  });

  metaSyncWorkerInstance = worker;
  return worker;
}

export async function stopMetaSyncWorker(): Promise<void> {
  if (metaSyncWorkerInstance) {
    await metaSyncWorkerInstance.close();
    metaSyncWorkerInstance = null;
    console.log('🛑 Meta-sync worker stopped');
  }
}