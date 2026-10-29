import { Worker } from 'bullmq';
import { getPublishDueQueue } from './queue.js';
import { startPublishDueWorker } from '../workers/publish-due.worker.js';
import { replaceLegacyRepeatablesWithScheduler } from './job-scheduler.js';

let worker: Worker | null = null;

export async function startPublishDueManager(): Promise<void> {
  const queue = await getPublishDueQueue();
  worker = await startPublishDueWorker();

  await replaceLegacyRepeatablesWithScheduler(
    queue,
    ['publish-due:tick'],
    ['publish-due-every-minute'],
    'cron-planner-publish-scheduled-content-every-1m',
    { pattern: '* * * * *' },
    {
      name: 'cron-planner-publish-scheduled-content',
      data: { timestamp: new Date().toISOString() },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
    },
  );

  console.log('✅ Publish-due scheduler started (runs every minute)');
}

export async function stopPublishDueManager(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('🛑 Publish-due worker stopped');
  }
}
