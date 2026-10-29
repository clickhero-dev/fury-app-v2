import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from './queue.js';
import { SubscriptionRenewalService } from '../services/billing/subscription-renewal.service.js';
import { replaceLegacyRepeatablesWithScheduler } from './job-scheduler.js';
import { getWorkerMetricsOptions } from './worker-metrics.js';

export const BILLING_RENEWAL_QUEUE_NAME = 'billing-renewal';
export const BILLING_RENEWAL_JOB_NAME = 'cron-ady-billing-renewal-plans';
const BILLING_RENEWAL_SCHEDULER_ID = 'cron-ady-billing-renewal-plans-every-2h';
const RENEWAL_INTERVAL_MS = 2 * 60 * 60 * 1000;
const RETRY_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 30_000 } };

let queue: Queue | null = null;
let worker: Worker | null = null;
let startPromise: Promise<void> | null = null;

/** Agenda renovação imediata no primeiro boot e recorrência global a cada 2h. */
export function startSubscriptionRenewalManager(
  service: SubscriptionRenewalService = new SubscriptionRenewalService(),
  intervalMs: number = RENEWAL_INTERVAL_MS,
): Promise<void> {
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const connection = await getRedisConnection();
    queue = new Queue(BILLING_RENEWAL_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        ...RETRY_OPTIONS,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });

    worker = new Worker(
      BILLING_RENEWAL_QUEUE_NAME,
      async (job) => {
        if (
          job.name !== BILLING_RENEWAL_JOB_NAME &&
          job.name !== 'cron:billing:renew_plan_and_credits' &&
          job.name !== 'cron-ady-billing-renewal-plans-and-credits'
        ) {
          throw new Error(`Unsupported billing renewal job: ${job.name}`);
        }
        return service.renewAllDue();
      },
      { connection, concurrency: 1, ...getWorkerMetricsOptions('billing-renewal-worker') },
    );
    worker.on('error', (error) => console.error('[BILLING-RENEWAL] worker error:', error.message));
    worker.on('failed', (job, error) => {
      console.error('[BILLING-RENEWAL] job failed:', { jobId: job?.id, error: error.message });
    });

    await replaceLegacyRepeatablesWithScheduler(
      queue,
      [],
      ['billing-renewal-every-two-hours', 'cron-ady-billing-renewal-plans-and-credits-every-2h'],
      BILLING_RENEWAL_SCHEDULER_ID,
      { every: intervalMs, immediately: true },
      {
        name: BILLING_RENEWAL_JOB_NAME,
        data: {},
        opts: RETRY_OPTIONS,
      },
    );
    console.log('[BILLING-RENEWAL] scheduler started (every 2 hours)');
  })().catch(async (error) => {
    await worker?.close().catch(() => undefined);
    await queue?.close().catch(() => undefined);
    worker = null;
    queue = null;
    startPromise = null;
    throw error;
  });

  return startPromise;
}

export async function stopSubscriptionRenewalManager(): Promise<void> {
  if (startPromise) await startPromise.catch(() => undefined);
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
  startPromise = null;
}
