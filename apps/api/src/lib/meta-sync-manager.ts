import { Worker, Queue } from 'bullmq';
import { getRedisConnection } from './queue.js';
import { startMetaSyncWorker, stopMetaSyncWorker } from '../workers/meta-sync.worker.js';

let worker: Worker | null = null;

/**
 * Meta-sync manager: agenda o cron a cada 15min (cron *&#47;15 * * * *) + um
 * bootstrap no startup da API (padrão google-sync-manager).
 */
export async function startMetaSyncManager(): Promise<void> {
  const connection = await getRedisConnection();
  worker = await startMetaSyncWorker();

  const queue = new Queue('meta-sync', { connection });

  // Remove o repeatable legado antes de registrar o Job Scheduler v5. Os dois
  // mecanismos usam metadados distintos no Redis; o upsert não substitui o
  // repeatable criado pela API antiga, o que causaria ticks duplicados.
  await queue.removeRepeatable('meta-sync:tick', { pattern: '*/15 * * * *' }, 'meta-sync-tick');

  // Cron de reconciliação a cada 15 minutos. O Job Scheduler mantém o próximo
  // tick de forma atômica no Redis e o id estável torna startups repetidos idempotentes.
  await queue.upsertJobScheduler(
    'meta-sync-tick',
    { pattern: '*/15 * * * *' },
    { name: 'meta-sync:tick', data: {} },
  );

  await queue.upsertJobScheduler(
    'meta-healthcheck-every-12h',
    { pattern: '0 */12 * * *' },
    { name: 'meta-healthcheck:run-all', data: {} },
  );

  // Bootstrap: roda imediatamente no startup (todos os tenants conectados).
  await queue.add(
    'meta-sync:bootstrap',
    { timestamp: new Date().toISOString() },
    { jobId: 'meta-sync-bootstrap' }
  );

  console.log('✅ Meta schedulers started (sync every 15min, healthcheck every 12h + bootstrap)');
}

export async function stopMetaSyncManager(): Promise<void> {
  await stopMetaSyncWorker();
  worker = null;
  console.log('🛑 Meta-sync worker stopped');
}
