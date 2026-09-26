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

  // Cron: a cada 15 minutos (D7/D8 — casa com o stale de 15min dos endpoints v2).
  await queue.add(
    'meta-sync:tick',
    { timestamp: new Date().toISOString() },
    { repeat: { pattern: '*/15 * * * *' }, jobId: 'meta-sync:tick' }
  );

  // Bootstrap: roda imediatamente no startup (todos os tenants conectados).
  await queue.add(
    'meta-sync:bootstrap',
    { timestamp: new Date().toISOString() },
    { jobId: 'meta-sync:bootstrap' }
  );

  console.log('✅ Meta-sync scheduler started (every 15min + bootstrap)');
}

export async function stopMetaSyncManager(): Promise<void> {
  await stopMetaSyncWorker();
  worker = null;
  console.log('🛑 Meta-sync worker stopped');
}