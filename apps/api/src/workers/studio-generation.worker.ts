import { Worker } from 'bullmq';
import { processStudioGenerationJob, type StudioGenerationJobData, type GenerateStudioImageResult } from '../services/studio/studio.service.js';
import { withJobSpan } from '../lib/otel-jobs.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const QUEUE_NAME = 'studio-generate-image';

let studioWorker: Worker<StudioGenerationJobData, GenerateStudioImageResult> | null = null;

export async function startStudioGenerationWorker(): Promise<void> {
  if (studioWorker) {
    return;
  }

  studioWorker = new Worker<StudioGenerationJobData, GenerateStudioImageResult>(
    QUEUE_NAME,
    async (job) =>
      withJobSpan({ queue: QUEUE_NAME, jobId: job.id }, `${QUEUE_NAME} process`, async () =>
        processStudioGenerationJob(job.data)
      ),
    {
      connection: {
        url: redisUrl,
      },
      concurrency: 6,
    }
  );

  studioWorker.on('completed', (job) => {
    console.info('Studio generation job completed', { id: job.id });
  });

  studioWorker.on('failed', (job, error) => {
    console.error('Studio generation job failed', {
      id: job?.id,
      error,
    });
  });

  studioWorker.on('error', (error) => {
    console.error('Studio generation worker Redis error:', error);
  });

  console.log('✅ Studio generation worker started');
}

export async function stopStudioGenerationWorker(): Promise<void> {
  if (!studioWorker) {
    return;
  }

  await studioWorker.close();
  studioWorker = null;
  console.log('🛑 Studio generation worker stopped');
}