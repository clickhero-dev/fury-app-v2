import { Worker } from 'bullmq';
import { getFuryEngineQueue, FURY_ENGINE_QUEUE_NAME, type FuryEngineJobPayload } from './queue.js';
import { startFuryEngineWorker } from '../workers/fury-engine.worker.js';
import { replaceLegacyRepeatablesWithScheduler } from './job-scheduler.js';

let worker: Worker<FuryEngineJobPayload> | null = null;

export async function startFuryEngine(): Promise<void> {
  const queue = await getFuryEngineQueue();
  worker = await startFuryEngineWorker();

  await replaceLegacyRepeatablesWithScheduler(
    queue,
    ['fury:evaluate'],
    ['fury-engine-every-30-minutes'],
    'cron-fury-engine-evaluate-automations-every-30m',
    { pattern: '*/30 * * * *' },
    {
      name: 'cron-fury-engine-evaluate-automations',
      data: { timestamp: new Date().toISOString() },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
    },
  );

  console.log('✅ Fury engine scheduler started (runs every 30 minutes)');
}

export async function stopFuryEngine(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('🛑 Fury engine worker stopped');
  }
}
