import { randomUUID } from 'crypto';
import { Queue, Worker } from 'bullmq';
import type { MetaAdAccount } from './meta-api.js';
import { getUserAdAccounts } from './meta-api.js';
import { getRedisConnection } from './queue.js';
import { getRedis } from './redis.js';
import { decryptMetaToken } from '../utils/crypto.js';
import { MetaRepository } from '../repository/meta.repository.js';
import { getWorkerMetricsOptions } from './worker-metrics.js';

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
  queuedAt: string | Date;
}

export const META_INITIAL_SYNC_QUEUE_NAME = 'meta-initial-sync';
export const META_INITIAL_SYNC_JOB_NAME = 'worker-meta-onboarding-sync-assets';
const LEGACY_QUEUE_KEY = 'meta:sync:queue';
const LEGACY_MIGRATING_KEY = 'meta:sync:queue:migrating';
const LEGACY_MIGRATION_LOCK_KEY = 'meta:sync:queue:migration-lock';
const LEGACY_MIGRATION_LOCK_TTL_SECONDS = 300;
const RETRY_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 2_000 } };

let queue: Queue | null = null;
let worker: Worker | null = null;
let startPromise: Promise<void> | null = null;

async function getMetaInitialSyncQueue(): Promise<Queue> {
  if (queue) return queue;
  const connection = await getRedisConnection();
  queue = new Queue(META_INITIAL_SYNC_QUEUE_NAME, {
    connection,
    defaultJobOptions: { ...RETRY_OPTIONS, removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return queue;
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

function toBullMQJobData(job: SyncJobRecord): SyncJobPayload {
  return { ...job, queuedAt: job.queuedAt.toISOString() };
}

async function processSyncJob(job: SyncJobRecord): Promise<void> {
  const repo = new MetaRepository(job.tenantId);
  const connection = await repo.findMetaConnectionByMetaUserId(job.metaUserId);

  if (!connection) {
    console.warn('Meta sync job skipped: connection not found', {
      jobId: job.id,
      tenantId: job.tenantId,
      metaUserId: job.metaUserId,
    });
    return;
  }

  const accessToken = decryptMetaToken(connection.accessToken);
  const { accounts: refreshedAdAccounts } = await getUserAdAccounts(accessToken);
  await repo.patchMetaConnection(connection.id, { adAccounts: refreshedAdAccounts });

  console.info('Meta sync job processed', {
    id: job.id,
    tenantId: job.tenantId,
    metaUserId: job.metaUserId,
    adAccountsCount: refreshedAdAccounts.length,
  });
}

async function enqueueLegacyPayload(targetQueue: Queue, raw: string): Promise<void> {
  let job: SyncJobRecord;
  try {
    job = parseSyncJob(raw);
  } catch (error) {
    console.error('Discarding invalid legacy Meta sync job:', error instanceof Error ? error.message : error);
    return;
  }

  await targetQueue.add(META_INITIAL_SYNC_JOB_NAME, toBullMQJobData(job), {
    jobId: job.id,
    ...RETRY_OPTIONS,
  });
}

/**
 * Moves legacy list entries into a recoverable staging list before enqueueing.
 * If BullMQ is unavailable, the staged payload stays in Redis for the next boot.
 */
async function migrateLegacySyncJobs(targetQueue: Queue): Promise<void> {
  const redis = getRedis();
  const lockToken = randomUUID();
  const acquired = await redis.set(
    LEGACY_MIGRATION_LOCK_KEY,
    lockToken,
    'EX',
    LEGACY_MIGRATION_LOCK_TTL_SECONDS,
    'NX',
  );
  if (acquired !== 'OK') return;

  try {
    while (true) {
      let raw = await redis.lindex(LEGACY_MIGRATING_KEY, 0);
      if (raw === null) {
        raw = await redis.lmove(LEGACY_QUEUE_KEY, LEGACY_MIGRATING_KEY, 'LEFT', 'RIGHT');
      }
      if (raw === null) break;

      await enqueueLegacyPayload(targetQueue, raw);
      await redis.lrem(LEGACY_MIGRATING_KEY, 1, raw);
    }
  } finally {
    await redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      1,
      LEGACY_MIGRATION_LOCK_KEY,
      lockToken,
    );
  }
}

export async function startSyncJobsWorker(): Promise<void> {
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const connection = await getRedisConnection();
    const targetQueue = await getMetaInitialSyncQueue();
    worker = new Worker<SyncJobPayload>(
      META_INITIAL_SYNC_QUEUE_NAME,
      async (job) => {
        if (
          job.name !== META_INITIAL_SYNC_JOB_NAME &&
          job.name !== 'worker:meta:sync_initial_assets' &&
          job.name !== 'meta-initial-sync'
        ) {
          throw new Error(`Unsupported Meta initial sync job: ${job.name}`);
        }
        await processSyncJob(parseSyncJob(JSON.stringify(job.data)));
      },
      { connection, concurrency: 1, ...getWorkerMetricsOptions('meta-initial-sync-worker') },
    );
    worker.on('error', (error) => console.error('Meta initial sync worker error:', error.message));
    worker.on('failed', (job, error) => {
      console.error('Meta initial sync job failed:', { jobId: job?.id, error: error.message });
    });

    await migrateLegacySyncJobs(targetQueue);
    console.log('✅ Meta initial sync BullMQ worker started');
  })().catch(async (error) => {
    await worker?.close().catch(() => undefined);
    await queue?.close().catch(() => undefined);
    worker = null;
    queue = null;
    startPromise = null;
    throw error;
  });

  return startPromise;
}

export async function stopSyncJobsWorker(): Promise<void> {
  if (startPromise) await startPromise.catch(() => undefined);
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
  startPromise = null;
  console.log('🛑 Meta initial sync BullMQ worker stopped');
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

  await (await getMetaInitialSyncQueue()).add(META_INITIAL_SYNC_JOB_NAME, toBullMQJobData(job), {
    jobId: job.id,
    ...RETRY_OPTIONS,
  });

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
