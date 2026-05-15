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

let _studioQueue: Queue | null = null;
export function getStudioQueue(): Queue {
  if (!_studioQueue) {
    _studioQueue = new Queue('studio-generate-image', { connection: { url: redisUrl } });
  }
  return _studioQueue;
}

let _studioQueueEvents: QueueEvents | null = null;
export function getStudioQueueEvents(): QueueEvents {
  if (!_studioQueueEvents) {
    _studioQueueEvents = new QueueEvents('studio-generate-image', { connection: { url: redisUrl } });
  }
  return _studioQueueEvents;
}

let _complianceQueue: Queue | null = null;
export function getComplianceQueue(): Queue {
  if (!_complianceQueue) {
    _complianceQueue = new Queue('compliance-check', { connection: { url: redisUrl } });
  }
  return _complianceQueue;
}

export async function closeStudioQueue(): Promise<void> {
  await getStudioQueueEvents().close();
  await getStudioQueue().close();
}

export async function closeComplianceQueue(): Promise<void> {
  await getComplianceQueue().close();
}