import { db, creativeAssets } from '@fury/db';
import { and, inArray, lt } from 'drizzle-orm';
import { getRedis } from '../../lib/redis.js';
import { getComplianceQueue, STUDIO_COMPLIANCE_QUEUE_NAME } from '../../lib/queue.js';

export const ORPHAN_AFTER_MS = 30 * 60 * 1000; // >30min pendente → análise órfã (evita falsos órfãos de gerações lentas)
const SWEEPER_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CANDIDATES = 100;

export type OrphanCandidate = { id: string; tenantId: string; createdAt: Date };

/** Assets com compliance pendente criados há mais de ORPHAN_AFTER_MS. */
export async function findOrphanCandidates(dbClient: any = db): Promise<OrphanCandidate[]> {
  const deadline = new Date(Date.now() - ORPHAN_AFTER_MS);
  return dbClient
    .select({
      id: creativeAssets.id,
      tenantId: creativeAssets.tenantId,
      createdAt: creativeAssets.createdAt,
    })
    .from(creativeAssets)
    .where(
      and(
        inArray(creativeAssets.complianceStatus, ['pending', 'pending_compliance']),
        lt(creativeAssets.createdAt, deadline)
      )
    )
    .limit(MAX_CANDIDATES);
}

/** Ids de assets com job de compliance na fila (wait/active/delayed) — parse do Redis. */
export async function getComplianceInFlightIds(): Promise<Set<string>> {
  const redis = getRedis();
  const base = `bull:${STUDIO_COMPLIANCE_QUEUE_NAME}`;
  const ids = new Set<string>();

  const [wait, active, delayed] = await Promise.all([
    redis.lrange(`${base}:wait`, 0, -1) as Promise<string[]>,
    redis.lrange(`${base}:active`, 0, -1) as Promise<string[]>,
    redis.zrange(`${base}:delayed`, 0, -1) as Promise<string[]>,
  ]);

  for (const raw of [...wait, ...active, ...delayed]) {
    try {
      const job = JSON.parse(raw) as { data?: { creativeAssetId?: string } };
      if (job.data?.creativeAssetId) ids.add(job.data.creativeAssetId);
    } catch { /* item inválido na lista — ignora */ }
  }
  return ids;
}

/**
 * Rede de segurança do compliance: re-enfileira análises órfãs.
 * Uma imagem nunca fica "analisando" para sempre: se o job morreu no meio
 * (rate-limit, queda de Redis, restart), o asset segue `pending_compliance`
 * e este sweep detecta (pendente > 10min, sem job em fila) e re-enfileira —
 * com retry (attempts + backoff). Retorna quantas foram re-enfileiradas.
 */
export async function sweepOrphanComplianceAnalysis(deps: {
  db?: any;
  inFlight?: Set<string> | Promise<Set<string>>;
  queue?: { add: (...args: any[]) => Promise<unknown> };
} = {}): Promise<number> {
  const dbClient = deps.db ?? db;
  const queue = deps.queue ?? (await getComplianceQueue());
  const inFlight = await (deps.inFlight ?? getComplianceInFlightIds());

  const candidates = await findOrphanCandidates(dbClient);
  if (candidates.length === 0) return 0;

  let reenqueued = 0;
  for (const candidate of candidates) {
    if (inFlight.has(candidate.id)) continue;
    await queue.add(
      'compliance-check',
      { creativeAssetId: candidate.id, tenantId: candidate.tenantId },
      {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 4,
        backoff: { type: 'exponential', delay: 10_000 },
      }
    );
    reenqueued++;
  }

  if (reenqueued > 0) {
    console.log(`[COMPLIANCE-SWEEPER] ${reenqueued} análise(s) órfã(s) re-enfileirada(s).`);
  }
  return reenqueued;
}

let sweeperTimer: NodeJS.Timeout | null = null;

/** Agenda o sweep periódico (a cada 5min). Nunca derruba o processo. */
export function startComplianceSweeper(intervalMs: number = SWEEPER_INTERVAL_MS): void {
  if (sweeperTimer) return;
  sweeperTimer = setInterval(() => {
    void sweepOrphanComplianceAnalysis().catch((err) =>
      console.error('[COMPLIANCE-SWEEPER] erro no sweep:', err instanceof Error ? err.message : err)
    );
  }, intervalMs);
  sweeperTimer.unref?.();
}

export function stopComplianceSweeper(): void {
  if (sweeperTimer) {
    clearInterval(sweeperTimer);
    sweeperTimer = null;
  }
}