import { Queue, QueueEvents } from 'bullmq';
import type IORedis from 'ioredis';
import { getRedis, waitForRedisReady } from './redis.js';

// ==================== Singleton da conexão Redis ====================
let redisConnection: IORedis | null = null;
let pendingConnection: Promise<IORedis> | null = null;

/**
 * Retorna uma única conexão Redis (singleton).
 * Se a conexão ainda não existir, cria uma nova.
 * Se já estiver criando, aguarda a mesma Promise.
 */
export async function getRedisConnection(): Promise<IORedis> {
  await waitForRedisReady();
  if (redisConnection && redisConnection.status === 'ready') {
    return redisConnection;
  }
  if (pendingConnection) {
    return pendingConnection;
  }
  pendingConnection = (async () => {
    const conn = getRedis().duplicate();
    // Aguarda a conexão duplicada ficar pronta (sem chamar .connect())
    if (conn.status !== 'ready') {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          conn.off('ready', onReady);
          conn.off('error', onError);
        };
        conn.once('ready', onReady);
        conn.once('error', onError);
      });
    }
    redisConnection = conn;
    pendingConnection = null;
    return conn;
  })();
  return pendingConnection;
}

/**
 * Fecha a conexão singleton (use ao encerrar o processo)
 */
export async function closeRedisConnection(): Promise<void> {
  if (pendingConnection) {
    await pendingConnection;
  }
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
}

// ==================== Definição de tipos ====================
export type RuleEngineJobPayload = {
  timestamp: string;
};

export const RULE_ENGINE_QUEUE_NAME = 'rule-engine' as const;

export type FuryEngineJobPayload = {
  timestamp: string;
};

export const FURY_ENGINE_QUEUE_NAME = 'fury-engine' as const;

// ==================== Funções para obter filas (lazy loading) ====================
export async function createRuleEngineQueue() {
  const connection = await getRedisConnection();
  return new Queue<RuleEngineJobPayload>(RULE_ENGINE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

// Studio queue
let studioQueueInstance: Queue | null = null;
export async function getStudioQueue() {
  if (!studioQueueInstance) {
    const connection = await getRedisConnection();
    studioQueueInstance = new Queue('studio-generate-image', { connection });
  }
  return studioQueueInstance;
}

let studioQueueEventsInstance: QueueEvents | null = null;
export async function getStudioQueueEvents() {
  if (!studioQueueEventsInstance) {
    const connection = await getRedisConnection();
    studioQueueEventsInstance = new QueueEvents('studio-generate-image', { connection });
  }
  return studioQueueEventsInstance;
}

export async function closeStudioQueue() {
  if (studioQueueEventsInstance) {
    await studioQueueEventsInstance.close();
    studioQueueEventsInstance = null;
  }
  if (studioQueueInstance) {
    await studioQueueInstance.close();
    studioQueueInstance = null;
  }
}

// Studio compliance queue
export const STUDIO_COMPLIANCE_QUEUE_NAME = 'studio-compliance-check' as const;

let complianceQueueInstance: Queue | null = null;
export async function getStudioComplianceQueue() {
  if (!complianceQueueInstance) {
    const connection = await getRedisConnection();
    complianceQueueInstance = new Queue(STUDIO_COMPLIANCE_QUEUE_NAME, { connection });
  }
  return complianceQueueInstance;
}

export async function getComplianceQueue() {
  return getStudioComplianceQueue();
}

export async function closeComplianceQueue() {
  if (complianceQueueInstance) {
    await complianceQueueInstance.close();
    complianceQueueInstance = null;
  }
}

export async function closeStudioComplianceQueue() {
  await closeComplianceQueue();
}

// Fury engine queue
let furyEngineQueueInstance: Queue<FuryEngineJobPayload> | null = null;
export async function getFuryEngineQueue() {
  if (!furyEngineQueueInstance) {
    const connection = await getRedisConnection();
    furyEngineQueueInstance = new Queue<FuryEngineJobPayload>(FURY_ENGINE_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return furyEngineQueueInstance;
}

export async function closeFuryEngineQueue() {
  if (furyEngineQueueInstance) {
    await furyEngineQueueInstance.close();
    furyEngineQueueInstance = null;
  }
}

// Alias para compatibilidade com código antigo
export const createBullConnection = getRedisConnection;

// Publish-due queue
export const PUBLISH_DUE_QUEUE_NAME = 'publish-due' as const;

let publishDueQueueInstance: Queue | null = null;
export async function getPublishDueQueue() {
  if (!publishDueQueueInstance) {
    const connection = await getRedisConnection();
    publishDueQueueInstance = new Queue(PUBLISH_DUE_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return publishDueQueueInstance;
}

export async function closePublishDueQueue() {
  if (publishDueQueueInstance) {
    await publishDueQueueInstance.close();
    publishDueQueueInstance = null;
  }
}
