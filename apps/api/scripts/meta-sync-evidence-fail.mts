/**
 * Evidência 2: handler do tick com ERRO não derruba a cadeia do Job Scheduler,
 * e o evento 'failed' é emitido (observabilidade). Redis db 15, isolado.
 */
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const stamp = Date.now();
const q = `ev-fail-${stamp}`;
const PATTERN = '*/5 * * * * *';
const RUN_MS = 22_000;

const redis = new IORedis('redis://localhost:6380', { db: 15, maxRetriesPerRequest: null });
await redis.flushdb();

const fires: number[] = [];
const failures: string[] = [];
const queue = new Queue(q, { connection: redis.duplicate() });
await queue.upsertJobScheduler('meta-sync-tick', { pattern: PATTERN }, { name: 'meta-sync:tick', data: {} });

const worker = new Worker(
  q,
  async (job) => {
    fires.push(Date.now());
    if (fires.length % 2 === 0) throw new Error('erro simulado no handler do tick');
  },
  { connection: redis.duplicate(), concurrency: 2 },
);
worker.on('failed', (job, err) => failures.push(`${job?.name}:${err.message}`));

await new Promise((r) => setTimeout(r, RUN_MS));

const delayed = await queue.getDelayedCount();
const schedulers = await queue.getJobSchedulers();
await worker.close();
await queue.close();
await redis.flushdb();
await redis.quit();

const gaps = fires.slice(1).map((t, i) => t - fires[i]);
console.log(`disparos=${fires.length} (esperado ~${Math.round(RUN_MS / 5000)}) · gaps(ms)=${gaps.join(',')}`);
console.log(`jobs 'failed' capturados pelo worker=${failures.length} → ${failures.join(' | ')}`);
console.log(`ocorrências delayed agendadas após as falhas=${delayed} · schedulers=${schedulers.length} (idempotente)`);
process.exit(0);