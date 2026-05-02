import type IORedis from 'ioredis';
import {
  createBullConnection,
  createCampaignSyncQueue,
} from '../lib/queue.js';
import { createCampaignSyncWorker, listActiveMetaConnections } from './campaign-sync.worker.js';

let started = false;

type WorkerHandles = {
  connection: IORedis;
  worker: ReturnType<typeof createCampaignSyncWorker>;
  intervalId: NodeJS.Timeout;
};

let handles: WorkerHandles | null = null;

export async function addSyncJob(tenantId: string, metaConnectionId: string) {
  const connection = await createBullConnection();
  const queue = createCampaignSyncQueue(connection);

  await queue.add(
    'syncCampaigns',
    { tenantId, metaConnectionId },
    {
      jobId: `syncCampaigns:${tenantId}:${metaConnectionId}`,
      attempts: 10,
      backoff: {
        type: 'fixed',
        delay: 5 * 60 * 1000,
      },
    }
  );

  await queue.close();
  await connection.quit();
}

async function enqueueAllActiveConnections(queueConn: IORedis) {
  const queue = createCampaignSyncQueue(queueConn);
  const active = await listActiveMetaConnections();

  for (const row of active) {
    await queue.add(
      'syncCampaigns',
      { tenantId: row.tenantId, metaConnectionId: row.id },
      {
        jobId: `syncCampaigns:${row.tenantId}:${row.id}`,
        attempts: 10,
        backoff: {
          type: 'fixed',
          delay: 5 * 60 * 1000,
        },
      }
    );
  }
}

export async function initWorkers() {
  if (started) return handles;
  started = true;

  const connection = await createBullConnection();
  const worker = createCampaignSyncWorker(connection);

  await enqueueAllActiveConnections(connection);

  const intervalId = setInterval(() => {
    enqueueAllActiveConnections(connection).catch((err) => {
      console.error('[workers] enqueueAllActiveConnections failed:', (err as Error).message);
    });
  }, 30 * 60 * 1000);

  handles = { connection, worker, intervalId };
  console.log('[workers] started campaign-sync worker + scheduler');

  return handles;
}

export async function shutdownWorkers() {
  if (!handles) return;

  clearInterval(handles.intervalId);
  await handles.worker.close();
  await handles.connection.quit();

  handles = null;
  started = false;
  console.log('[workers] shutdown complete');
}