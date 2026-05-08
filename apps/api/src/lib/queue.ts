import { Queue, QueueEvents } from 'bullmq';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const studioQueue = new Queue('studio-generate-image', {
  connection: {
    url: redisUrl,
  },
});

export const studioQueueEvents = new QueueEvents('studio-generate-image', {
  connection: {
    url: redisUrl,
  },
});

export const complianceQueue = new Queue('compliance-check', {
  connection: {
    url: redisUrl,
  },
});

export async function closeStudioQueue(): Promise<void> {
  await studioQueueEvents.close();
  await studioQueue.close();
}

export async function closeComplianceQueue(): Promise<void> {
  await complianceQueue.close();
}