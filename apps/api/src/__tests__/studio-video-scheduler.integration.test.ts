/*
Funcionalidade: recuperação periódica durável no Redis isolado
Cenário: startup e restart são idempotentes
Dado um scheduler registrado por duas réplicas
Quando uma réplica reinicia antes da próxima ocorrência
Então existe um único scheduler sem novo sweep imediato
Cenário: varreduras lentas não se sobrepõem entre réplicas
Dado duas réplicas e um sweep mais lento que o intervalo
Quando várias ocorrências são processadas
Então só uma recuperação está ativa globalmente
Cenário: erro transitório usa retry apenas de recovery
Dado uma varredura que falha uma vez
Quando BullMQ aplica backoff
Então a mesma ocorrência termina no segundo attempt
*/
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { isSafeChatTestRedis } from './helpers/chat-test-redis.js';
const url = process.env.TEST_CHAT_REDIS_URL;
if (url && !isSafeChatTestRedis(url, process.env.REDIS_URL)) throw new Error('Redis deve ser local, DB15 e igual a REDIS_URL');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await sleep(20); }
  throw new Error('timeout aguardando scheduler de vídeo');
}
describe.skipIf(!url)('scheduler de vídeo com réplicas Redis reais', () => {
  const replicas: { stopStudioVideoWorker: () => Promise<void>; closeRedis: () => Promise<void> }[] = [];
  let queue: Queue, connection: Redis;
  async function replica(recoverPendingJobs: () => Promise<number>, interval: number) {
    vi.resetModules();
    const worker = await import('../workers/studio-video.worker.js');
    const redis = await import('../lib/redis.js');
    replicas.push({ ...worker, closeRedis: redis.closeRedis });
    await worker.startStudioVideoWorker({ recoverPendingJobs, processJob: vi.fn(), markFailed: vi.fn() } as any, { recoveryIntervalMs: interval });
    return worker;
  }
  async function isolatedQueue() {
    connection = new Redis(url!, { maxRetriesPerRequest: null });
    queue = new Queue('studio-video-recovery', { connection });
    // Exclusively the recovery queue on the dedicated test Redis, never FLUSHDB.
    await queue.obliterate({ force: true });
  }
  afterEach(async () => {
    for (const r of replicas) { await r.stopStudioVideoWorker(); await r.closeRedis(); }
    replicas.length = 0;
    if (queue) { await queue.obliterate({ force: true }); await queue.close(); await connection.quit(); }
  });
  it('mantém único scheduler e próximo disparo durante startup/restart', async () => {
    await isolatedQueue();
    const recover = vi.fn(async () => 1);
    const first = await replica(recover, 60_000);
    await until(async () => (await queue.getJobCounts('completed')).completed === 1);
    await replica(recover, 60_000);
    await until(async () => (await queue.getWorkers()).length === 2);
    const [before] = await queue.getJobSchedulers();
    expect(before.key).toBe('cron-studio-video-recover-pending-every-30s');
    await first.stopStudioVideoWorker();
    await first.startStudioVideoWorker({ recoverPendingJobs: recover } as any, { recoveryIntervalMs: 60_000 });
    await until(async () => (await queue.getWorkers()).length === 2);
    await sleep(150);
    const schedulers = await queue.getJobSchedulers();
    expect(schedulers).toHaveLength(1);
    expect(schedulers[0].next).toBe(before.next);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(await queue.getGlobalConcurrency()).toBe(1);
  });
  it('serializa sweeps lentos de duas réplicas sem bloquear recorrência', async () => {
    await isolatedQueue();
    let active = 0, peak = 0, count = 0;
    const recover = async () => { active++; peak = Math.max(peak, active); await sleep(160); active--; return ++count; };
    await replica(recover, 50);
    await replica(recover, 50);
    await until(async () => count >= 4);
    expect(await queue.getWorkers()).toHaveLength(2);
    for (const r of replicas) await r.stopStudioVideoWorker();
    const stoppedCount = count;
    await sleep(150);
    expect(count).toBe(stoppedCount);
    expect(peak).toBe(1);
    expect(active).toBe(0);
    expect(await queue.getJobSchedulers()).toHaveLength(1);
  });
  it('aplica retry com backoff na mesma ocorrência de recovery', async () => {
    await isolatedQueue();
    const recover = vi.fn().mockRejectedValueOnce(Error('transient DB outage')).mockResolvedValue(1);
    await replica(recover, 60_000);
    await until(async () => (await queue.getJobCounts('completed')).completed === 1);
    const [job] = await queue.getJobs(['completed']);
    expect(job.name).toBe('cron-studio-video-recover-pending');
    expect(job.attemptsMade).toBe(2);
    expect(job.opts).toMatchObject({ attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
    expect(recover).toHaveBeenCalledTimes(2);
  });
});
