import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../lib/queue.js';
import { replaceLegacyRepeatablesWithScheduler } from '../lib/job-scheduler.js';
import { NotificationRepository } from '../repository/notification.repository.js';

export const NOTIFICATION_RETENTION_QUEUE_NAME = 'notifications-retention';
export const NOTIFICATION_RETENTION_JOB_NAME = 'cron-notifications-delete-expired-daily';
const SCHEDULER_ID = `${NOTIFICATION_RETENTION_JOB_NAME}-every-day`;
let queue: Queue | null = null; let worker: Worker | null = null; let startPromise: Promise<void> | null = null;

export function startNotificationRetentionWorker(intervalMs = 24 * 60 * 60 * 1000): Promise<void> {
  if (startPromise) return startPromise;
  startPromise = (async () => {
    const connection = await getRedisConnection(); const repository = new NotificationRepository();
    queue = new Queue(NOTIFICATION_RETENTION_QUEUE_NAME, { connection });
    worker = new Worker(NOTIFICATION_RETENTION_QUEUE_NAME, async (job) => { if (job.name !== NOTIFICATION_RETENTION_JOB_NAME) throw new Error(`Unsupported notification retention job: ${job.name}`); let deleted = 0; let batch = 0; do { batch = await repository.deleteExpiredBatch(); deleted += batch; } while (batch > 0); return { deleted }; }, { connection, concurrency: 1 });
    await replaceLegacyRepeatablesWithScheduler(queue, [], [], SCHEDULER_ID, { every: intervalMs, immediately: true }, { name: NOTIFICATION_RETENTION_JOB_NAME, data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } } });
  })().catch(async (error) => { await worker?.close().catch(() => undefined); await queue?.close().catch(() => undefined); worker = null; queue = null; startPromise = null; throw error; });
  return startPromise;
}

export async function stopNotificationRetentionWorker() { if (startPromise) await startPromise.catch(() => undefined); await worker?.close(); await queue?.close(); worker = null; queue = null; startPromise = null; }
