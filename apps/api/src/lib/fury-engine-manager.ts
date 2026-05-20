import { Worker } from 'bullmq';
import { getFuryEngineQueue, FURY_ENGINE_QUEUE_NAME, type FuryEngineJobPayload } from './queue.js';
import { startFuryEngineWorker } from '../workers/fury-engine.worker.js';

let worker: Worker<FuryEngineJobPayload> | null = null;

export async function startFuryEngine(): Promise<void> {
  const queue = await getFuryEngineQueue();
  worker = await startFuryEngineWorker();

  await queue.add('fury:evaluate', { timestamp: new Date().toISOString() }, {
    repeat: { pattern: '*/30 * * * *' },
  });

  console.log('✅ Fury engine scheduler started (runs every 30 minutes)');
}

export async function stopFuryEngine(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('🛑 Fury engine worker stopped');
  }
}
