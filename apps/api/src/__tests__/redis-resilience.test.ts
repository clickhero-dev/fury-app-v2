import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mocks = vi.hoisted(() => ({ clients: [] as any[], constructor: vi.fn() }));
vi.mock('ioredis', () => ({ default: class extends EventEmitter {
  status = 'connecting';
  constructor(url: string, options: any) { super(); mocks.constructor(url, options); mocks.clients.push(this); }
  duplicate() { return new (this.constructor as any)('duplicate', {}); }
  disconnect() { this.status = 'end'; }
  async quit() { this.status = 'end'; }
} }));
vi.mock('bullmq', () => ({ Queue: class {}, QueueEvents: class {} }));

describe('Conexão Redis resiliente', () => {
  beforeEach(() => { vi.resetModules(); mocks.clients.length = 0; mocks.constructor.mockClear(); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('REDIS_URL', ''); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it('rejeita configuração ausente ou inválida sem expor credenciais', async () => {
    const { getRedis } = await import('../lib/redis.js');
    expect(() => getRedis()).toThrow('REDIS_CONFIG_INVALID');
    vi.stubEnv('REDIS_URL', 'https://user:secret@example.com');
    expect(() => getRedis()).toThrow('REDIS_CONFIG_INVALID');
    expect(mocks.constructor).not.toHaveBeenCalled();
  });
  it('lê URL na primeira criação e limita fallback ao desenvolvimento explícito', async () => {
    const { getRedis } = await import('../lib/redis.js');
    vi.stubEnv('REDIS_URL', 'rediss://user:secret@example.com:6380');
    getRedis();
    expect(mocks.constructor).toHaveBeenCalledWith('rediss://user:secret@example.com:6380', expect.any(Object));
    expect(mocks.constructor.mock.calls[0][1].retryStrategy(1)).toBe(200);
    expect(mocks.constructor.mock.calls[0][1].retryStrategy(10)).toBe(2000);
    expect(mocks.constructor.mock.calls[0][1].retryStrategy(11)).toBeNull();
  });
  it('tolera erro transitório, recupera e remove listeners', async () => {
    vi.stubEnv('REDIS_URL', 'redis://example.com');
    const { waitForRedisReady } = await import('../lib/redis.js');
    const pending = waitForRedisReady(); const client = mocks.clients[0];
    client.emit('error', new Error('secret')); client.status = 'ready'; client.emit('ready');
    await expect(pending).resolves.toBeUndefined();
    expect(client.listenerCount('ready')).toBe(1);
  });
  it('encerra espera limitada e permite nova tentativa após indisponibilidade', async () => {
    vi.stubEnv('REDIS_URL', 'redis://example.com');
    vi.useFakeTimers(); const { waitForRedisReady } = await import('../lib/redis.js');
    const pending = waitForRedisReady(); const rejection = expect(pending).rejects.toThrow('REDIS_CONNECTION_TIMEOUT');
    await vi.advanceTimersByTimeAsync(25000); await rejection;
    const retry = waitForRedisReady(); const client = mocks.clients[0]; client.status = 'ready'; client.emit('ready');
    await expect(retry).resolves.toBeUndefined();
  });
  it('libera conexão duplicada após timeout e recupera sem promise rejeitada em cache', async () => {
    vi.stubEnv('REDIS_URL', 'redis://example.com'); vi.useFakeTimers();
    const { getRedisConnection } = await import('../lib/queue.js');
    const first = getRedisConnection(); const rejected = expect(first).rejects.toThrow('REDIS_CONNECTION_TIMEOUT');
    mocks.clients[0].status = 'ready'; mocks.clients[0].emit('ready'); await vi.advanceTimersByTimeAsync(0);
    const failed = mocks.clients[1]; await vi.advanceTimersByTimeAsync(25000); await rejected;
    expect(failed.status).toBe('end'); expect(failed.listenerCount('ready')).toBe(0); expect(failed.listenerCount('end')).toBe(0);
    const retry = getRedisConnection(); await vi.advanceTimersByTimeAsync(0);
    const recovered = mocks.clients[2]; recovered.status = 'ready'; recovered.emit('ready');
    await expect(retry).resolves.toBe(recovered);
  });
  it('permite fallback apenas em ambiente de teste ou desenvolvimento', async () => {
    vi.stubEnv('NODE_ENV', 'test'); const { getRedis } = await import('../lib/redis.js'); getRedis();
    expect(mocks.constructor).toHaveBeenCalledWith('redis://localhost:6379', expect.any(Object));
  });

});
