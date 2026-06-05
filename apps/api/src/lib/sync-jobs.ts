import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, metaConnections } from './db.js';
import type { MetaAdAccount } from './meta-api.js';
import { getUserAdAccounts } from './meta-api.js';
import { decryptMetaToken } from '../utils/crypto.js';
import { getRedis, waitForRedisReady } from './redis.js';

export interface AddSyncJobParams {
  tenantId: string;
  metaUserId: string;
  adAccounts: MetaAdAccount[];
}

export interface SyncJobRecord {
  id: string;
  type: 'meta-initial-sync';
  tenantId: string;
  metaUserId: string;
  adAccounts: MetaAdAccount[];
  queuedAt: Date;
}

interface SyncJobPayload {
  id: string;
  type: 'meta-initial-sync';
  tenantId: string;
  metaUserId: string;
  adAccounts?: MetaAdAccount[];
  queuedAt: string;
}

const META_SYNC_QUEUE_KEY = 'meta:sync:queue';
const BLPOP_TIMEOUT_SECONDS = 5;

let workerRunning = false;
let workerPromise: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

async function processSyncJob(job: SyncJobRecord): Promise<void> {
  const connection = await db.query.metaConnections.findFirst({
    where: and(
      eq(metaConnections.tenantId, job.tenantId),
      eq(metaConnections.metaUserId, job.metaUserId)
    ),
  });

  if (!connection) {
    console.warn('Meta sync job skipped: connection not found', {
      jobId: job.id,
      tenantId: job.tenantId,
      metaUserId: job.metaUserId,
    });
    return;
  }

  const accessToken = decryptMetaToken(connection.accessToken);
  const refreshedAdAccounts = await getUserAdAccounts(accessToken);

  await db
    .update(metaConnections)
    .set({
      adAccounts: refreshedAdAccounts,
    })
    .where(eq(metaConnections.id, connection.id));

  console.info('Meta sync job processed', {
    id: job.id,
    tenantId: job.tenantId,
    metaUserId: job.metaUserId,
    adAccountsCount: refreshedAdAccounts.length,
  });
}

function parseSyncJob(raw: string): SyncJobRecord {
  const payload = JSON.parse(raw) as SyncJobPayload;
  if (!payload.id || !payload.tenantId || !payload.metaUserId) {
    throw new Error('Payload de sync job invalido.');
  }

  return {
    ...payload,
    queuedAt: new Date(payload.queuedAt),
    adAccounts: payload.adAccounts || [],
    type: 'meta-initial-sync',
  };
}

async function runWorkerLoop(): Promise<void> {
  await waitForRedisReady();
  const mainRedis = getRedis();

  // Cria uma conexão dedicada para o worker (blpop é bloqueante)
  const workerRedis = mainRedis.duplicate();
  workerRedis.on('error', (err) => {
    console.error('Meta sync worker Redis error:', err);
  });

  // Aguarda a conexão duplicada ficar pronta (sem chamar .connect())
  if (workerRedis.status !== 'ready') {
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
        workerRedis.off('ready', onReady);
        workerRedis.off('error', onError);
      };
      workerRedis.once('ready', onReady);
      workerRedis.once('error', onError);
    });
  }

  try {
    while (workerRunning) {
      try {
        const result = await workerRedis.blpop(META_SYNC_QUEUE_KEY, BLPOP_TIMEOUT_SECONDS);
        if (!result) {
          continue;
        }

        const [, rawJob] = result;
        const job = parseSyncJob(rawJob);
        await processSyncJob(job);
      } catch (error) {
        if (!workerRunning) {
          break;
        }
        console.error('Failed to process meta sync job:', error);
        await sleep(1000);
      }
    }
  } finally {
    await workerRedis.quit();
  }
}

export async function startSyncJobsWorker(): Promise<void> {
  if (workerRunning) {
    return;
  }
  workerRunning = true;
  workerPromise = runWorkerLoop();
  console.log('✅ Meta sync worker started');
}

export async function stopSyncJobsWorker(): Promise<void> {
  if (!workerRunning) {
    return;
  }
  workerRunning = false;
  if (workerPromise) {
    await workerPromise;
    workerPromise = null;
  }
  console.log('🛑 Meta sync worker stopped');
}

export async function addSyncJob(params: AddSyncJobParams): Promise<SyncJobRecord> {
  await waitForRedisReady();
  const mainRedis = getRedis();

  const job: SyncJobRecord = {
    id: randomUUID(),
    type: 'meta-initial-sync',
    tenantId: params.tenantId,
    metaUserId: params.metaUserId,
    adAccounts: params.adAccounts,
    queuedAt: new Date(),
  };

  await mainRedis.rpush(META_SYNC_QUEUE_KEY, JSON.stringify(job));

  console.info('Meta sync job queued', {
    id: job.id,
    type: job.type,
    tenantId: job.tenantId,
    metaUserId: job.metaUserId,
    adAccountsCount: job.adAccounts.length,
    queuedAt: job.queuedAt.toISOString(),
  });

  return job;
}