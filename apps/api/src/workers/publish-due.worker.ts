import { Worker } from 'bullmq';
import { PUBLISH_DUE_QUEUE_NAME } from '../lib/queue.js';
import { publishDuePosts } from '../services/planner/planner.service.js';
import { db } from '@fury/db';
import { withJobSpan } from '../lib/otel-jobs.js';

interface PublishDueJobData {
  timestamp: string;
}

let publishDueWorkerInstance: Worker<PublishDueJobData> | null = null;

export async function startPublishDueWorker(): Promise<Worker<PublishDueJobData>> {
  const worker = new Worker<PublishDueJobData>(
    PUBLISH_DUE_QUEUE_NAME,
    async (job) => {
      await withJobSpan(
        { queue: PUBLISH_DUE_QUEUE_NAME, jobId: job.id },
        `${PUBLISH_DUE_QUEUE_NAME} process`,
        async () => {
          const allTenants = await db.query.tenants.findMany();
          let total = 0;
          for (const tenant of allTenants) {
            try {
              const result = await publishDuePosts(tenant.id);
              total += result.published;
              if (result.published > 0) {
                const handle = result.instagramUsername ? `@${result.instagramUsername}` : result.pageName || 'desconhecida';
                console.log(`[publish-due] tenant ${tenant.id}: ${result.published} posts → ${handle}`);
              }
            } catch (e) {
              console.error(`[publish-due] Tenant ${tenant.id} failed:`, (e as Error).message);
            }
          }
          if (total > 0) console.log(`[publish-due] Published ${total} posts across ${allTenants.length} tenants`);
        }
      );
    },
    {
      connection: (await import('../lib/redis.js')).getRedis().duplicate(),
      concurrency: 1,
    },
  );

  worker.on('error', (err) => {
    console.error('[publish-due] Worker error:', err.message);
  });

  publishDueWorkerInstance = worker;
  return worker;
}

export async function stopPublishDueWorker(): Promise<void> {
  if (publishDueWorkerInstance) {
    await publishDueWorkerInstance.close();
    publishDueWorkerInstance = null;
    console.log('🛑 Publish-due worker stopped');
  }
}
