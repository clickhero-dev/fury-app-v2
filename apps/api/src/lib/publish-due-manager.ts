import { Worker } from 'bullmq';
import { getPublishDueQueue, PUBLISH_DUE_QUEUE_NAME } from './queue.js';
import { startPublishDueWorker } from '../workers/publish-due.worker.js';

let worker: Worker | null = null;

export async function startPublishDueManager(): Promise<void> {
  const queue = await getPublishDueQueue();
  worker = await startPublishDueWorker();

  await queue.add('publish-due:tick', { timestamp: new Date().toISOString() }, {
    repeat: { pattern: '*/5 * * * *' },
  });

  console.log('✅ Publish-due scheduler started (runs every 5 minutes)');
}

export async function stopPublishDueManager(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('🛑 Publish-due worker stopped');
  }
}
