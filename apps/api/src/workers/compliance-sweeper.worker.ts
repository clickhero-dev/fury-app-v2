import { Queue, Worker } from 'bullmq';
import { getWorkerMetricsOptions } from '../lib/worker-metrics.js';
import { getRedisConnection } from '../lib/queue.js';
import { sweepOrphanComplianceAnalysis } from '../services/studio/compliance-sweeper.js';
import { replaceLegacyRepeatablesWithScheduler } from '../lib/job-scheduler.js';

export const COMPLIANCE_SWEEPER_QUEUE_NAME = 'studio-compliance-sweeper';
export const COMPLIANCE_SWEEPER_JOB_NAME = 'cron-studio-compliance-requeue-orphaned-checks';
const SCHEDULER_ID = 'cron-studio-compliance-requeue-orphaned-checks-every-5m';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;
let startPromise: Promise<void> | null = null;

/** Agenda a recuperação dos checks órfãos como job durável, sem timer local. */
export function startComplianceSweeper(intervalMs: number = DEFAULT_INTERVAL_MS): Promise<void> {
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const connection = await getRedisConnection();
    queue = new Queue(COMPLIANCE_SWEEPER_QUEUE_NAME, { connection });
    worker = new Worker(
      COMPLIANCE_SWEEPER_QUEUE_NAME,
      async (job) => {
        if (
          job.name !== COMPLIANCE_SWEEPER_JOB_NAME &&
          job.name !== 'cron:studio:requeue_orphaned_compliance'
        ) {
          throw new Error(`Unsupported compliance sweeper job: ${job.name}`);
        }
        return sweepOrphanComplianceAnalysis();
      },
      { connection, concurrency: 1, ...getWorkerMetricsOptions('studio-compliance-sweeper-worker') },
    );
    worker.on('error', (error) => console.error('[COMPLIANCE-SWEEPER] worker error:', error.message));
    worker.on('failed', (job, error) => {
      console.error('[COMPLIANCE-SWEEPER] job failed:', { jobId: job?.id, error: error.message });
    });

    await replaceLegacyRepeatablesWithScheduler(
      queue,
      [],
      ['studio-compliance-sweeper-every-five-minutes'],
      SCHEDULER_ID,
      { every: intervalMs },
      {
        name: COMPLIANCE_SWEEPER_JOB_NAME,
        data: {},
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
      },
    );
    console.log('[COMPLIANCE-SWEEPER] BullMQ scheduler started (every 5 minutes)');
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

export async function stopComplianceSweeper(): Promise<void> {
  if (startPromise) await startPromise.catch(() => undefined);
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
  startPromise = null;
}
