import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { getRedis } from './redis.js';

/**
 * BullMQ expects dedicated connections; we duplicate the existing ioredis instance
 * so we keep the same URL/options from `redis.ts` without re-declaring them.
 */
export async function createBullConnection(): Promise<IORedis> {
  const redis = getRedis();
  const conn = redis.duplicate();
  // `redis.ts` already connected, so connection is ready.
  return conn;
}

export type CampaignSyncJobPayload = {
  tenantId: string;
  metaConnectionId: string;
};

export const CAMPAIGN_SYNC_QUEUE_NAME = 'campaign-sync' as const;

export function createCampaignSyncQueue(connection: IORedis) {
  return new Queue<CampaignSyncJobPayload>(CAMPAIGN_SYNC_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

