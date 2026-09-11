import { Worker, Queue } from 'bullmq';
import { getRedis } from '../lib/redis.js';
import { MetaInsightsSyncService } from '../services/campaigns/metrics-sync.service.js';
import { MetricsDailyRepository } from '../repository/metrics-daily.repository.js';
import { MetaRepository } from '../repository/meta.repository.js';
import { decryptMetaToken } from '../utils/crypto.js';
import { getMetaInsights, metaApiCall, type MetaInsightsData } from '../lib/meta-api.js';
import { db } from '@fury/db';

/**
 * Worker metrics-sync (feature 014) — job BullMQ repeatable a cada 1h que
 * sincroniza insights Meta → metrics_daily para todos os tenants.
 *
 * Padrão: budget-optimizer.worker.ts (queue + repeatable cron).
 * Multi-instância: lock Redis `lock:metrics-sync` (SET NX EX) — apenas uma
 * execução por vez em N instâncias.
 * Warmup: startMetricsSyncWorker({ warmup: true }) dispara uma execução em
 * background no startup (fire-and-forget, não bloqueia o listen).
 *
 * Nota constituição: workers podem acessar `db` direto (exceção documentada),
 * mas a persistência do rollup continua passando pelo MetricsDailyRepository.
 */

export const METRICS_SYNC_CRON = '0 * * * *'; // a cada hora, no minuto 0
const LOCK_KEY = 'lock:metrics-sync';
const LOCK_TTL_SECONDS = 50 * 60; // < 1h: lock expira antes do próximo ciclo

interface MetricsSyncJobData {
  source?: 'cron' | 'warmup' | 'manual';
}

let workerInstance: Worker<MetricsSyncJobData> | null = null;
let queueInstance: Queue<MetricsSyncJobData> | null = null;

/** Lista todos os tenant IDs (workers: exceção documentada da constituição). */
async function listAllTenantIds(): Promise<string[]> {
  const rows = await db.query.tenants.findMany();
  return rows.map((t) => t.id);
}

/**
 * Cria o service de sync com as fronteiras reais (Meta + conexões + rollup).
 * Instanciado por execução para não prender conexões entre jobs.
 */
function createSyncService(): MetaInsightsSyncService {
  const fetchInsights = async (
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<MetaInsightsData[]> => {
    const connection = await new MetaRepository(tenantId).findLatestMetaConnection();
    if (!connection) {
      throw Object.assign(new Error('META_NOT_CONNECTED'), { code: 'META_NOT_CONNECTED' });
    }
    const accessToken = decryptMetaToken(connection.accessToken);
    const adAccounts = (connection.adAccounts as any[]) || [];
    const adAccountId =
      (connection as any).selectedAdAccountId ||
      adAccounts.find((a: any) => a.account_status === 1)?.id ||
      adAccounts[0]?.id;
    if (!adAccountId) {
      throw Object.assign(new Error('NO_AD_ACCOUNT'), { code: 'NO_AD_ACCOUNT' });
    }
    const response = await getMetaInsights({
      accessToken,
      adAccountId,
      startDate,
      endDate,
      level: 'campaign',
      timeIncrement: 1,
    });
    return response.data || [];
  };

  const listCampaigns = async (tenantId: string) => {
    const connection = await new MetaRepository(tenantId).findLatestMetaConnection();
    if (!connection) return [];
    const accessToken = decryptMetaToken(connection.accessToken);
    const adAccounts = (connection.adAccounts as any[]) || [];
    const adAccountId =
      (connection as any).selectedAdAccountId ||
      adAccounts.find((a: any) => a.account_status === 1)?.id ||
      adAccounts[0]?.id;
    if (!adAccountId) return [];
    const resp = await metaApiCall<{ data: { id: string; name?: string; status?: string; objective?: string }[] }>(
      `/${encodeURIComponent(adAccountId)}/campaigns?fields=${encodeURIComponent('id,name,status,objective')}`,
      accessToken
    );
    return resp.data || [];
  };

  return new MetaInsightsSyncService({
    fetchInsights,
    listCampaigns,
    findConnection: async (tenantId: string) => {
      const connection = await new MetaRepository(tenantId).findLatestMetaConnection();
      if (!connection) return null;
      const adAccounts = (connection.adAccounts as any[]) || [];
      const adAccountId =
        (connection as any).selectedAdAccountId ||
        adAccounts.find((a: any) => a.account_status === 1)?.id ||
        adAccounts[0]?.id;
      if (!adAccountId) return null;
      return { accessToken: decryptMetaToken(connection.accessToken), adAccountId };
    },
    metricsDaily: {
      upsertBatch: async (tenantId, rows) => {
        await new MetricsDailyRepository(tenantId).upsertBatch(rows);
      },
    },
  });
}

/**
 * Executa um ciclo completo de sync (com lock distribuído).
 * Usado pelo handler do job, pelo warmup e por disparo manual (dev/ops).
 */
export async function runMetricsSyncNow(
  job: { data?: MetricsSyncJobData } = {}
): Promise<{ skipped: boolean; results?: { tenantId: string; ok: boolean; reason?: string; upserted: number }[] }> {
  const redis = getRedis();
  const acquired = await redis.set(LOCK_KEY, String(process.pid), 'EX', LOCK_TTL_SECONDS);
  if (!acquired) {
    console.log('[METRICS-SYNC] ⏭️  Outra instância está sincronizando — pulando ciclo');
    return { skipped: true };
  }

  try {
    const tenantIds = await listAllTenantIds();
    const service = createSyncService();
    const results = await service.syncAll(tenantIds);

    const okCount = results.filter((r) => r.ok).length;
    const skippedCount = results.filter((r) => !r.ok && r.reason === 'META_NOT_CONNECTED').length;
    const errorCount = results.filter((r) => !r.ok && r.reason && !r.reason.startsWith('META_NOT')).length;
    const totalRows = results.reduce((sum, r) => sum + r.upserted, 0);

    console.log(
      `[METRICS-SYNC] ✅ Ciclo (${job.data?.source ?? 'cron'}): ${okCount} ok, ${skippedCount} sem Meta, ${errorCount} erro, ${totalRows} linhas upsertadas`
    );
    return { skipped: false, results };
  } finally {
    await redis.del(LOCK_KEY);
  }
}

async function handleSyncJob(job: { id?: string; data?: MetricsSyncJobData }): Promise<void> {
  console.log(`[METRICS-SYNC] 🔄 Executando ciclo de sincronização (job ${job.id ?? 'manual'})`);
  await runMetricsSyncNow({ data: job.data });
}

/**
 * Inicia o worker + agenda o repeatable horário.
 * @param opts.warmup dispara uma execução em background imediatamente (startup).
 */
export async function startMetricsSyncWorker(opts: { warmup?: boolean } = {}): Promise<void> {
  if (workerInstance) {
    console.log('[METRICS-SYNC] ℹ️  Worker já rodando, pulando init');
    return;
  }

  workerInstance = new Worker<MetricsSyncJobData>('metrics-sync', async (job) => {
    await handleSyncJob(job);
  }, { connection: getRedis() });
  workerInstance.on('failed', (job, err) => {
    console.error(`[METRICS-SYNC] ❌ Job ${job?.id ?? '?'} falhou:`, err?.message);
  });

  queueInstance = new Queue<MetricsSyncJobData>('metrics-sync', { connection: getRedis() });
  try {
    await queueInstance.add(
      'hourly-sync',
      { source: 'cron' },
      { repeat: { pattern: METRICS_SYNC_CRON } }
    );
    console.log(`[METRICS-SYNC] ⏰ Job horário agendado (${METRICS_SYNC_CRON})`);
  } catch (err: any) {
    console.error('[METRICS-SYNC] Falha ao agendar job horário:', err?.message);
  }

  if (opts.warmup) {
    // fire-and-forget: startup não espera o sync (falha silenciosa por tenant)
    void runMetricsSyncNow({ data: { source: 'warmup' } }).catch((err) => {
      console.error('[METRICS-SYNC] Warmup falhou (não bloqueia startup):', err?.message);
    });
    console.log('[METRICS-SYNC] 🔥 Warmup disparado em background');
  }
}

export async function stopMetricsSyncWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
