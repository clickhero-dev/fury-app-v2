import { Worker, Queue } from 'bullmq';
import { getRedisConnection } from './queue.js';
import { startGoogleSyncWorker, stopGoogleSyncWorker } from '../workers/google-sync.worker.js';
import { replaceLegacyRepeatablesWithScheduler } from './job-scheduler.js';

let worker: Worker | null = null;

export async function startGoogleSyncManager(): Promise<void> {
  const connection = await getRedisConnection();
  worker = await startGoogleSyncWorker();

  const queue = new Queue('google-sync', { connection });
  await replaceLegacyRepeatablesWithScheduler(
    queue,
    ['google-sync:tick'],
    ['google-sync-every-minute'],
    'cron-google-business-profile-sync-every-1m',
    { pattern: '* * * * *' },
    {
      name: 'cron-google-business-profile-sync',
      data: { timestamp: new Date().toISOString() },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
    },
  );

  console.log('✅ Google-sync scheduler started (runs every minute)');
}

export async function stopGoogleSyncManager(): Promise<void> {
  await stopGoogleSyncWorker();
  worker = null;
  console.log('🛑 Google-sync worker stopped');
}
