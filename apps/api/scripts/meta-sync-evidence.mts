/**
 * Evidência para PR fix/meta-sync-scheduler.
 * Roda com bullmq REAL + Redis local (db 15, isolado) e mede o disparo contínuo
 * de um tick a cada 5s: mecanismo LEGADO (queue.add + repeat + jobId fixo) vs
 * FIX (queue.upsertJobScheduler). Também valida removeRepeatable do legado.
 * Executar: cd .worktrees/meta-sync-fix && npx tsx /tmp/meta-sync-evidence.mts
 */
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = 'redis://localhost:6380';
const stamp = Date.now();
const legacyQ = `ev-old-${stamp}`;
const newQ = `ev-new-${stamp}`;
const PATTERN = '*/5 * * * * *'; // a cada 5 segundos (mesma mecânica do */15)
const RUN_MS = 32_000;

const redis = new IORedis(REDIS_URL, { db: 15, maxRetriesPerRequest: null });
await redis.flushdb();

const fires: Record<string, number[]> = { legacy: [], neu: [] };

const mkWorker = (queueName: string, key: 'legacy' | 'neu') =>
  new Worker(
    queueName,
    async (job) => {
      fires[key].push(Date.now());
      await new Promise((r) => setTimeout(r, 5)); // trabalho simbólico
    },
    { connection: redis.duplicate(), concurrency: 2 },
  );

// ---- LEGADO (código antigo do meta-sync-manager) ----
const legacyQueue = new Queue(legacyQ, { connection: redis.duplicate() });
await legacyQueue.add('meta-sync:tick', { ts: 'x' }, { repeat: { pattern: PATTERN }, jobId: 'meta-sync-tick' });
const wLegacy = mkWorker(legacyQ, 'legacy');

// ---- FIX (upsertJobScheduler) ----
const newQueue = new Queue(newQ, { connection: redis.duplicate() });
await newQueue.upsertJobScheduler('meta-sync-tick', { pattern: PATTERN }, { name: 'meta-sync:tick', data: {} });
const wNew = mkWorker(newQ, 'neu');

console.log(`corrida: ${RUN_MS / 1000}s · cron ${PATTERN} · filas ${legacyQ} e ${newQ}`);
await new Promise((r) => setTimeout(r, RUN_MS / 2));

// boot "número 2" no fix: upsert de novo (idempotência)
await newQueue.upsertJobScheduler('meta-sync-tick', { pattern: PATTERN }, { name: 'meta-sync:tick', data: {} });
console.log('[fix] 2º upsertJobScheduler (re-boot) executado sem erro');

await new Promise((r) => setTimeout(r, RUN_MS / 2));

// ---- removeRepeatable do legado (valida a limpeza do deploy) ----
const before = await newQueue.getJobSchedulers();
const legacyRemoved = await legacyQueue.removeRepeatable('meta-sync:tick', { pattern: PATTERN }, 'meta-sync-tick');
const afterLegacy = await legacyQueue.getJobSchedulers();
const delayedLegacy = await legacyQueue.getDelayedCount();

await wLegacy.close();
await wNew.close();
await legacyQueue.close();
await newQueue.close();
await redis.flushdb();
await redis.quit();

// ---- relatório ----
const fmt = (arr: number[]) => `n=${arr.length} · gaps(ms)=${arr.slice(1).map((t, i) => t - arr[i]).join(',')}`;
console.log('\n=== LEGADO (queue.add+repeat+jobId) ===');
console.log(fmt(fires.legacy));
console.log('\n=== FIX (upsertJobScheduler) ===');
console.log(fmt(fires.neu));
console.log('\n=== limpeza do legado ===');
console.log('removeRepeatable retornou:', legacyRemoved);
console.log('job schedulers do fix:', before.length);
console.log('job schedulers restantes no legado após remove:', afterLegacy.length);
console.log('jobs delayed restantes no legado:', delayedLegacy);
const esperado = Math.round(RUN_MS / 5000);
console.log(`\nesperado ~${esperado} disparos por fila em ${RUN_MS / 1000}s (cron de 5s)`);
process.exit(0);