import { createDecipheriv, createHash, randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, metaConnections } from './db.js';
import type { MetaAdAccount } from './meta-api.js';
import { getUserAdAccounts } from './meta-api.js';
import { getRedis } from './redis.js';

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

function decryptToken(encryptedPayload: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Formato de token criptografado invalido.');
  }

  const jwtSecret = getRequiredEnv('JWT_SECRET');
  const key = createHash('sha256').update(jwtSecret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
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

  const accessToken = decryptToken(connection.accessToken);
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
  const workerRedis = getRedis().duplicate();

  workerRedis.on('error', (err) => {
    console.error('Meta sync worker Redis error:', err);
  });

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
  const job: SyncJobRecord = {
    id: randomUUID(),
    type: 'meta-initial-sync',
    tenantId: params.tenantId,
    metaUserId: params.metaUserId,
    adAccounts: params.adAccounts,
    queuedAt: new Date(),
  };

  await getRedis().rpush(META_SYNC_QUEUE_KEY, JSON.stringify(job));

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