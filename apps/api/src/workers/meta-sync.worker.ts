import { Worker } from 'bullmq';
import { db, metaConnections } from '../lib/db.js';
import { eq } from 'drizzle-orm';
import { getMetaSyncQueue } from '../lib/queue.js';
import { metaSyncService, type MetaSyncRunResult } from '../services/meta/meta-sync.service.js';
import { notifyMetaSyncFailure } from '../lib/meta-sync-alerts.js';
import { captureServerException, captureServerEvent } from '../lib/analytics.js';

export const META_SYNC_QUEUE_NAME = 'meta-sync';

/** Janela de 15min (ciclo) a partir de um timestamp — chave do jobId determinístico. */
export function windowKeyFor(timestamp: string): string {
  const t = new Date(timestamp);
  const slot = Math.floor(t.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000;
  return new Date(slot).toISOString().slice(0, 16);
}

/** Tenants com conexão Meta — alvo do sync periódico (leitura via lib/db). */
export async function getMetaSyncTenantIds(): Promise<string[]> {
  const rows = await db.select({ tenantId: metaConnections.tenantId }).from(metaConnections);
  return rows.map((r) => r.tenantId);
}

/**
 * Contas Meta únicas que exigem sync. Worker pode ler a conexão via db direto
 * (exceção documentada ADR-0001); toda escrita segue via MetaSyncRepository.
 */
export async function getMetaSyncAdAccountIds(): Promise<string[]> {
  const rows = await db
    .select({ adAccountId: metaConnections.selectedAdAccountId })
    .from(metaConnections);
  return [...new Set(rows.map((row) => row.adAccountId).filter((id): id is string => Boolean(id)))];
}

async function getMetaSyncAdAccountIdForTenant(tenantId: string): Promise<string | null> {
  const connection = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
  });
  return connection?.selectedAdAccountId ?? null;
}

/**
 * Enfileira um job `meta-sync:run` por conta de anúncios com jobId determinístico
 * (conta + ciclo de 15min) — dedupe multi-pod via BullMQ.
 */
export async function enqueueMetaSyncRuns(
  timestamp: string,
  queue: { add: (...args: any[]) => Promise<unknown> }
): Promise<void> {
  const adAccountIds = await getMetaSyncAdAccountIds();
  const windowKey = windowKeyFor(timestamp).replace(/:/g, '-');
  for (const adAccountId of adAccountIds) {
    await queue.add(
      'meta-sync:run',
      { adAccountId, reason: 'scheduled' },
      { jobId: `meta-sync-acc-${adAccountId}-${windowKey}` },
    );
  }
}

/** Enfileira um tenant com o mesmo dedupe por janela usado pelo cron/bootstrap. */
export async function enqueueMetaSyncTenantRun(args: {
  tenantId: string;
  reason: string;
  timestamp?: string;
  queue?: { add: (...args: any[]) => Promise<unknown> };
}): Promise<void> {
  const queue = args.queue ?? await getMetaSyncQueue();
  const adAccountId = await getMetaSyncAdAccountIdForTenant(args.tenantId);
  if (!adAccountId) return;
  const windowKey = windowKeyFor(args.timestamp ?? new Date().toISOString()).replace(/:/g, '-');
  const staleRefresh = args.reason === 'stale-fallback';
  await queue.add(
    'meta-sync:run',
    { tenantId: args.tenantId, adAccountId, reason: args.reason },
    staleRefresh
      ? { jobId: `meta-sync-stale-${args.tenantId}`, removeOnComplete: { age: 300 } }
      : { jobId: `meta-sync-${args.tenantId}-${windowKey}` }
  );
}

/** Processa um run de um tenant; run failed → email de alerta (dedupe 6h). */
export async function processMetaSyncRun(tenantId: string, reason: string): Promise<void> {
  let result: MetaSyncRunResult;
  try {
    result = await metaSyncService.syncTenant({ tenantId, reason });
  } catch (err) {
    await notifyMetaSyncFailure({
      tenantId,
      errorCode: 'META_SYNC_UNEXPECTED_ERROR',
      message: 'Falha inesperada na sincronização Meta.',
    });
    throw err;
  }
  if (result.status === 'failed' && result.errorCode) {
    await notifyMetaSyncFailure({
      tenantId,
      errorCode: result.errorCode,
      message: result.errorMessage ?? '',
    });
  }
}

type MetaSyncJobData = { tenantId?: string; adAccountId?: string; reason?: string; timestamp?: string };
let metaSyncWorkerInstance: Worker<MetaSyncJobData> | null = null;

export async function startMetaSyncWorker(): Promise<Worker> {
  const worker = new Worker<MetaSyncJobData>(
    META_SYNC_QUEUE_NAME,
    async (job) => {
      if (job.name === 'meta-sync:run') {
        const { tenantId, adAccountId, reason } = job.data;
        if (adAccountId) {
          let results: Array<{ tenantId: string } & MetaSyncRunResult>;
          try {
            results = await metaSyncService.syncAdAccount({ adAccountId, reason: reason ?? 'scheduled' });
          } catch (err) {
            // Paridade com o caminho legado: exceção inesperada também alerta.
            await notifyMetaSyncFailure({
              tenantId: tenantId ?? 'unknown',
              errorCode: 'META_SYNC_UNEXPECTED_ERROR',
              message: 'Falha inesperada na sincronização Meta.',
            });
            throw err;
          }
          // Falhas esperadas retornam status 'failed' (não lançam): alerta + telemetria,
          // preservando o comportamento do caminho legado por tenant.
          const failed = results.filter((result) => result.status === 'failed' && result.tenantId);
          if (failed.length > 0) {
            for (const result of failed) {
              await notifyMetaSyncFailure({
                tenantId: result.tenantId,
                errorCode: result.errorCode ?? 'META_SYNC_FAILED',
                message: result.errorMessage ?? 'Falha na sincronização da conta.',
              });
            }
            captureServerEvent('meta_sync_run_failed', {
              adAccountId,
              failed: failed.map((result) => ({
                tenantId: result.tenantId,
                errorCode: result.errorCode ?? 'META_SYNC_FAILED',
              })),
            });
          }
        } else if (tenantId) {
          // Jobs legados em voo continuam compatíveis durante o deploy.
          await processMetaSyncRun(tenantId, reason ?? 'scheduled');
        }
      } else {
        // 'meta-sync:tick' / 'meta-sync:bootstrap' → enfileira runs por tenant.
        const ts = job.data.timestamp ?? new Date().toISOString();
        const queue = await getMetaSyncQueue();
        await enqueueMetaSyncRuns(ts, queue);
      }
    },
    {
      connection: (await import('../lib/redis.js')).getRedis().duplicate(),
      concurrency: 2,
    }
  );

  worker.on('error', (err) => {
    console.error('[meta-sync] Worker error:', err.message);
    captureServerException(err, { path: 'meta-sync:worker' });
  });

  worker.on('failed', (job, err) => {
    // Somente identificadores operacionais entram na telemetria; nunca token ou payload completo.
    const data = job?.data;
    captureServerException(err, {
      path: 'meta-sync:worker',
      ...(data?.tenantId ? { tenantId: data.tenantId } : {}),
      ...(data?.adAccountId ? { adAccountId: data.adAccountId } : {}),
    });
  });

  metaSyncWorkerInstance = worker;
  return worker;
}

export async function stopMetaSyncWorker(): Promise<void> {
  if (metaSyncWorkerInstance) {
    await metaSyncWorkerInstance.close();
    metaSyncWorkerInstance = null;
    console.log('🛑 Meta-sync worker stopped');
  }
}
