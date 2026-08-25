import { Worker } from 'bullmq';
import { processStudioGenerationJob, type StudioGenerationJobData, type GenerateStudioImageResult } from '../services/studio/studio.service.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let studioWorker: Worker<StudioGenerationJobData, GenerateStudioImageResult> | null = null;

export async function startStudioGenerationWorker(): Promise<void> {
  if (studioWorker) {
    return;
  }

  studioWorker = new Worker<StudioGenerationJobData, GenerateStudioImageResult>(
    'studio-generate-image',
    async (job) => processStudioGenerationJob(job.data),
    {
      connection: {
        url: redisUrl,
      },
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