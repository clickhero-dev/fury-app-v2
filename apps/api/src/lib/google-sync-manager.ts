import { Worker, Queue } from 'bullmq';
import { getRedisConnection } from './queue.js';
import { startGoogleSyncWorker, stopGoogleSyncWorker } from '../workers/google-sync.worker.js';

let worker: Worker | null = null;

export async function startGoogleSyncManager(): Promise<void> {
  const connection = await getRedisConnection();
  worker = await startGoogleSyncWorker();

  const queue = new Queue('google-sync', { connection });
  await queue.add('google-sync:tick', { timestamp: new Date().toISOString() }, {
    repeat: { pattern: '* * * * *' },
  });

  console.log('✅ Google-sync scheduler started (runs every minute)');
}

export async function stopGoogleSyncManager(): Promise<void> {
  await stopGoogleSyncWorker();
  worker = null;
  console.log('🛑 Google-sync worker stopped');
}