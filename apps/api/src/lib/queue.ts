import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { getRedis } from './redis.js';

/**
 * BullMQ expects dedicated connections; we duplicate the existing ioredis instance
 * so we keep the same URL/options from `redis.ts` without re-declaring them.
 */
export async function createBullConnection(): Promise<IORedis> {
  const conn = getRedis().duplicate();
  // `redis.ts` uses lazyConnect, so ensure the duplicated connection is actually connected.
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

