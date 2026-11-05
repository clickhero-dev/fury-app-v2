import { Worker, Queue } from 'bullmq';
import { getRedisConnection } from './queue.js';
import { startMetaSyncWorker, stopMetaSyncWorker } from '../workers/meta-sync.worker.js';
import { replaceLegacyRepeatablesWithScheduler } from './job-scheduler.js';

let worker: Worker | null = null;

/**
 * Meta-sync manager: agenda o cron a cada 15min (cron *&#47;15 * * * *) + um
 * bootstrap no startup da API (padrão google-sync-manager).
 */
export async function startMetaSyncManager(): Promise<void> {
  const connection = await getRedisConnection();
  worker = await startMetaSyncWorker();

  const queue = new Queue('meta-sync', { connection });

  await replaceLegacyRepeatablesWithScheduler(
    queue,
    ['meta-sync:tick'],
    ['meta-sync-tick'],
    'cron-meta-sync-ad-account-data-every-15m',
    { pattern: '*/15 * * * *' },
    { name: 'cron-meta-sync-ad-account-data', data: {} },
  );

  await replaceLegacyRepeatablesWithScheduler(
    queue,
    ['meta-healthcheck:run-all'],
    ['meta-healthcheck-every-12h'],
    'cron-meta-check-connection-health-every-12h',
    { pattern: '0 */12 * * *' },
    { name: 'cron-meta-check-connection-health', data: {} },
  );

  // Bootstrap: roda imediatamente no startup (todos os tenants conectados).
  await queue.add(
    'worker-meta-sync-all-connected-ad-accounts',
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
