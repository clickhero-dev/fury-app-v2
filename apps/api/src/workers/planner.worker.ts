import { Worker, Queue } from 'bullmq';
import { getRedis } from '../lib/redis.js';
import { runPlannerWorkflow } from '../planner-workflow-runner.js';

export interface PlannerJobData {
  jobId: string;
  tenantId: string;
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

export async function enqueuePlanGeneration(jobId: string, tenantId: string): Promise<void> {
  const queue = getPlannerQueue();
  const today = new Date().toISOString().split('T')[0];
  const deduplicationId = `planner-${tenantId}-${today}`;
  
  await queue.add('generate', { jobId, tenantId }, {
    jobId: deduplicationId,
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
      const { jobId, tenantId } = job.data;
      await runPlannerWorkflow(jobId, tenantId);
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