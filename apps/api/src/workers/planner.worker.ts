import { Worker, Queue } from 'bullmq';
import { getRedis } from '../lib/redis.js';
import { runPlannerWorkflow } from '../planner-workflow-runner.js';
import { withJobSpan } from '../lib/otel-jobs.js';

export interface PlannerJobData {
  jobId: string;
  tenantId: string;
  postsCount?: number;
}

const QUEUE_NAME = 'planner-generate';

let plannerWorker: Worker<PlannerJobData> | null = null;
let plannerQueue: Queue<PlannerJobData> | null = null;

export function getPlannerQueue(): Queue<PlannerJobData> {
  if (!plannerQueue) {
    plannerQueue = new Queue<PlannerJobData>(QUEUE_NAME, { connection: getRedis() });
  }
  return plannerQueue;
}

export async function enqueuePlanGeneration(jobId: string, tenantId: string, postsCount: number = 8): Promise<void> {
  const queue = getPlannerQueue();

  // SEM jobId fixo por dia: jobId estático + job falho preservado no Redis
  // (removeOnFail: 500) faz o BullMQ ignorar silenciosamente os generates do
  // resto do dia — a linha workflow_jobs fica 'pending' órfã e trava o lock.
  // A deduplicação por tenant já é feita pelo lock Postgres (findActiveByLockKey).
  await queue.add('generate', { jobId, tenantId, postsCount }, {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
}

export async function startPlannerWorker(): Promise<void> {
  if (plannerWorker) return;

  plannerWorker = new Worker<PlannerJobData>(
    QUEUE_NAME,
    async (job) => {
      const { jobId, tenantId, postsCount = 8 } = job.data;
      await withJobSpan(
        { queue: QUEUE_NAME, jobId, tenantId, attempt: job.attemptsMade + 1 },
        `${QUEUE_NAME} process`,
        async () => {
          await runPlannerWorkflow(jobId, tenantId, postsCount);
        }
      );
    },
    {
      connection: getRedis(),
      concurrency: 1,
    },
  );

  plannerWorker.on('completed', (job) => {
    console.info('[planner-worker] job completed', { id: job.id });
  });

  plannerWorker.on('failed', (job, error) => {
    console.error('[planner-worker] job failed', { id: job?.id, error: error.message });
  });

  plannerWorker.on('error', (error) => {
    console.error('[planner-worker] Redis error:', error);
  });

  console.log('✅ Planner worker started');
}

export async function stopPlannerWorker(): Promise<void> {
  if (plannerWorker) {
    await plannerWorker.close();
    plannerWorker = null;
  }
  if (plannerQueue) {
    await plannerQueue.close();
    plannerQueue = null;
  }
  console.log('🛑 Planner worker stopped');
}