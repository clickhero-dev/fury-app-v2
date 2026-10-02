import { Worker, Queue } from 'bullmq';
import { getRedis } from '../lib/redis.js';
import type { StudioVideoService } from '../services/studio/studio-video.service.js';

export interface StudioVideoJobData {
  jobId: string;
  tenantId: string;
}

export const STUDIO_VIDEO_QUEUE_NAME = 'studio-video';

let videoWorker: Worker<StudioVideoJobData> | null = null;
let videoQueue: Queue<StudioVideoJobData> | null = null;

function getStudioVideoQueue(): Queue<StudioVideoJobData> {
  if (!videoQueue) {
    videoQueue = new Queue<StudioVideoJobData>(STUDIO_VIDEO_QUEUE_NAME, { connection: getRedis() });
  }
  return videoQueue;
}

export async function enqueueStudioVideo(jobId: string, tenantId: string): Promise<void> {
  // Retry fica no service (reenvio ao MPT); aqui 1 tentativa e jobId = id do workflow_job
  await getStudioVideoQueue().add('generate', { jobId, tenantId }, {
    jobId,
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export async function startStudioVideoWorker(service: StudioVideoService): Promise<void> {
  if (videoWorker) return;

  videoWorker = new Worker<StudioVideoJobData>(
    STUDIO_VIDEO_QUEUE_NAME,
    async (job) => service.processJob(job.data.jobId),
    {
      connection: getRedis(),
      concurrency: 4,
      // job dura minutos: lock longo evita marcar como stalled
      lockDuration: 5 * 60 * 1000,
    },
  );

  videoWorker.on('failed', (job, error) => {
    console.error('[studio-video-worker] job failed', { id: job?.id, error: error.message });
  });

  videoWorker.on('error', (error) => {
    console.error('[studio-video-worker] Redis error:', error);
  });

  console.log('✅ Studio video worker started');
}

export async function stopStudioVideoWorker(): Promise<void> {
  if (videoWorker) {
    await videoWorker.close();
    videoWorker = null;
  }
  if (videoQueue) {
    await videoQueue.close();
    videoQueue = null;
  }
  console.log('🛑 Studio video worker stopped');
}
