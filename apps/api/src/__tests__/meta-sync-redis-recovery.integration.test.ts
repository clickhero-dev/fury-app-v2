import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const enabled = process.env.RUN_REDIS_RECOVERY_E2E === '1';
describe.skipIf(!enabled)('BullMQ Redis recovery', () => {
  const container = `fury-redis-qa-${randomUUID().slice(0, 8)}`;
  const queueName = `meta-sync-qa-${randomUUID()}`;
  let worker: Worker | undefined;
  let producer: Redis | undefined;
  let queue: Queue | undefined;
  afterAll(async () => {
    await worker?.close(true).catch(() => {});
    await queue?.close().catch(() => {});
    producer?.disconnect();
    vi.unstubAllEnvs();
    try { execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' }); } catch { /* container may not have started */ }
  });
  it('consumes jobs after Redis is unavailable beyond the reconnect limit', async () => {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    await new Promise<void>(resolve => server.close(() => resolve()));
    execFileSync('docker', ['run', '-d', '--name', container, '-p', `127.0.0.1:${port}:6379`, 'redis:7-alpine'], { stdio: 'ignore' });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REDIS_URL', `redis://127.0.0.1:${port}`);
    const { getRedisConnection, closeRedisConnection } = await import('../lib/queue.js');
    const { closeRedis } = await import('../lib/redis.js');
    const connection = await getRedisConnection();
    producer = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    queue = new Queue(queueName, { connection: producer });
    const seen: string[] = [];
    worker = new Worker(queueName, async job => { seen.push(job.id!); }, { connection });
    worker.on('error', () => {});
    const waitFor = async (id: string) => {
      const deadline = Date.now() + 15000;
      while (!seen.includes(id) && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
      expect(seen.filter(value => value === id)).toHaveLength(1);
    };
    try {
      await queue.add('sync', {}, { jobId: 'before' });
      await waitFor('before');
      execFileSync('docker', ['stop', '-t', '0', container], { stdio: 'ignore' });
      await new Promise(r => setTimeout(r, 15000));
      execFileSync('docker', ['start', container], { stdio: 'ignore' });
      await queue.add('sync', {}, { jobId: 'after' });
      await queue.add('sync', {}, { jobId: 'after' });
      await waitFor('after');
      await new Promise(r => setTimeout(r, 500));
      expect(seen.filter(value => value === 'after')).toHaveLength(1);
    } finally {
      connection.disconnect();
      await Promise.race([worker.close(true).catch(() => {}), new Promise(r => setTimeout(r, 1000))]); worker = undefined;
      await queue.close().catch(() => {}); queue = undefined;
      producer.disconnect(); producer = undefined;
      await Promise.race([closeRedisConnection().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
      await closeRedis();
    }
  }, 60000);
});
