import { Queue, QueueEvents } from 'bullmq';
import type IORedis from 'ioredis';
import { getRedis } from './redis.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * BullMQ expects dedicated connections; we duplicate the existing ioredis instance
 * so we keep the same URL/options from `redis.ts` without re-declaring them.
 */
export async function createBullConnection(): Promise<IORedis> {
  const conn = getRedis().duplicate();
  await conn.connect();
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

export type RuleEngineJobPayload = {
  timestamp: string;
};

export const RULE_ENGINE_QUEUE_NAME = 'rule-engine' as const;

export function createRuleEngineQueue(connection: IORedis) {
  return new Queue<RuleEngineJobPayload>(RULE_ENGINE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

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