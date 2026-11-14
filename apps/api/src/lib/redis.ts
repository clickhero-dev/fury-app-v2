import Redis from 'ioredis';

let redisClient: Redis | null = null;
let readyPromise: Promise<void> | null = null;

function redisUrl(): string {
  const value = process.env.REDIS_URL;
  if (!value && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')) {
    return 'redis://localhost:6379';
  }
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname) throw new Error();
    return value;
  } catch {
    throw new Error('REDIS_CONFIG_INVALID');
  }
}

export function getRedis(): Redis {
  if (!redisClient || redisClient.status === 'end') {
    redisClient = new Redis(redisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        if (times > 10) {
          console.error('[redis] REDIS_RETRIES_EXHAUSTED');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });
    redisClient.on('error', () => console.error('[redis] REDIS_CONNECTION_ERROR'));
    redisClient.on('connect', () => console.log('[redis] TCP conectado'));
    redisClient.on('ready', () => console.log('[redis] pronto'));
  }
  return redisClient;
}

/** Aguarda a prontidão, tolerando erros transitórios até o fim dos retries ou timeout. */
export function awaitRedisReady(client: Redis): Promise<void> {
  if (client.status === 'ready') return Promise.resolve();
  if (client.status === 'end') return Promise.reject(new Error('REDIS_CONNECTION_ENDED'));
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); client.off('ready', onReady); client.off('end', onEnd); };
    const onReady = () => { cleanup(); resolve(); };
    const onEnd = () => { cleanup(); reject(new Error('REDIS_CONNECTION_ENDED')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('REDIS_CONNECTION_TIMEOUT')); }, 25_000);
    client.once('ready', onReady);
    client.once('end', onEnd);
  });
}

export function waitForRedisReady(): Promise<void> {
  if (!readyPromise) {
    const client = getRedis();
    readyPromise = awaitRedisReady(client).finally(() => { readyPromise = null; });
  }
  return readyPromise;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
  if (readyPromise) await readyPromise.catch(() => {});
}
