import { Worker, Queue } from 'bullmq';
import { getWorkerMetricsOptions } from '../lib/worker-metrics.js';
import { getRedis } from '../lib/redis.js';
import type { StudioVideoService } from '../services/studio/studio-video.service.js';

export interface StudioVideoJobData {
  jobId: string;
  tenantId: string;
}

export const STUDIO_VIDEO_QUEUE_NAME = 'studio-video';

let videoWorker: Worker<StudioVideoJobData> | null = null;
let videoQueue: Queue<StudioVideoJobData> | null = null;
const DEFAULT_RECOVERY_INTERVAL_MS = 30_000;
export const STUDIO_VIDEO_RECOVERY_QUEUE_NAME = 'studio-video-recovery';
export const STUDIO_VIDEO_RECOVERY_SCHEDULER_ID = 'cron-studio-video-recover-pending-every-30s';
export const STUDIO_VIDEO_RECOVERY_JOB_NAME = 'cron-studio-video-recover-pending';
let recovery: { stopped: boolean; queue: Queue; worker: Worker | null; onReady: () => void } | null = null;

function getStudioVideoQueue(): Queue<StudioVideoJobData> {
  if (!videoQueue) {
    videoQueue = new Queue<StudioVideoJobData>(STUDIO_VIDEO_QUEUE_NAME, { connection: getRedis() });
  }
  return videoQueue;
}

export async function enqueueStudioVideo(jobId: string, tenantId: string): Promise<void> {
  // Sem retry automático (cada envio é cobrado); jobId = id do workflow_job
  const queue = getStudioVideoQueue();
  const existing = await queue.getJob(jobId);
  if (existing && ['completed', 'failed'].includes(await existing.getState())) {
    // The caller only recovers DB-pending jobs; the worker must claim before submit.
    await existing.remove();
  }
  await queue.add('worker-studio-video-generate', { jobId, tenantId }, {
    jobId,
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export async function startStudioVideoWorker(service: StudioVideoService, options: { recoveryIntervalMs?: number } = {}): Promise<void> {
  if (videoWorker) return;

  videoWorker = new Worker<StudioVideoJobData>(
    STUDIO_VIDEO_QUEUE_NAME,
    async (job) => service.processJob(job.data.jobId),
    {
      connection: getRedis(),
      concurrency: 4,
      ...getWorkerMetricsOptions('studio-video-worker'),
      // job dura minutos: lock longo evita marcar como stalled
      lockDuration: 5 * 60 * 1000,
      // A worker may have submitted a paid generation before crashing.
      // Never automatically replay a stalled job without the provider job ID.
      maxStalledCount: 0,
    },
  );

  videoWorker.on('failed', (job, error) => {
    console.error('[studio-video-worker] job failed', { id: job?.id, error: error.message });
    // ex.: stalled de novo após restart — não deixa o workflow_job preso em running
    if (job?.data.jobId) void service.markFailed(job.data.jobId, error.message).catch(() => undefined);
  });

  videoWorker.on('error', (error) => {
    console.error('[studio-video-worker] Redis error:', error);
  });

  const connection = getRedis();
  const queue = new Queue(STUDIO_VIDEO_RECOVERY_QUEUE_NAME, { connection });
  const state = { stopped: false, queue, worker: null as Worker | null, onReady: () => {} };
  recovery = state;
  let registering = false;
  const register = async () => {
    if (state.stopped || registering) return;
    registering = true;
    try {
      // Redis enforces this across replicas, not just this process's concurrency.
      await queue.setGlobalConcurrency(1);
      if (state.stopped) return;
      if (!state.worker) {
        state.worker = new Worker(STUDIO_VIDEO_RECOVERY_QUEUE_NAME,
          async () => { if (!state.stopped) await service.recoverPendingJobs(() => !state.stopped); },
          { connection, concurrency: 1, ...getWorkerMetricsOptions('studio-video-recovery-worker') },
        );
        state.worker.on('error', (error) => {
          console.error('[studio-video-recovery-worker] Redis error:', error);
        });
        state.worker.on('failed', (job, error) => {
          console.error('[studio-video-recovery-worker] sweep failed', { id: job?.id, error: error.message });
        });
      }
      // New schedulers run immediately; existing ones keep their next occurrence.
      await queue.upsertJobScheduler(STUDIO_VIDEO_RECOVERY_SCHEDULER_ID,
        { every: options.recoveryIntervalMs ?? DEFAULT_RECOVERY_INTERVAL_MS },
        { name: STUDIO_VIDEO_RECOVERY_JOB_NAME, data: {}, opts: {
          attempts: 3, backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100, removeOnFail: 500,
        } },
      );
    } catch {
      console.error('[studio-video-recovery-worker] scheduler indisponível; aguardando Redis ready');
    } finally { registering = false; }
  };
  // Startup must not wait for Redis during an outage. Pending Redis commands and
  // ready events restore registration without a local business timer.
  state.onReady = () => { void register(); };
  connection.on('ready', state.onReady);
  void register();

  console.log('✅ Studio video worker started');
}

export async function stopStudioVideoWorker(): Promise<void> {
  if (recovery) {
    const state = recovery;
    state.stopped = true;
    getRedis().off('ready', state.onReady);
    // Drain the current sweep so a restart cannot overlap it in this process.
    if (state.worker) await state.worker.close();
    await state.queue.close();
    recovery = null;
  }
  if (videoWorker) {
    // não espera jobs de minutos; a retomada usa o id do OpenRouter salvo
    await videoWorker.close(true);
    videoWorker = null;
  }
  if (videoQueue) {
    await videoQueue.close();
    videoQueue = null;
  }
  console.log('🛑 Studio video worker stopped');
}
