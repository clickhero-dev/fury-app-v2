import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let redisClient: Redis | null = null;
let readyPromise: Promise<void> | null = null;

/**
 * Retorna a instância singleton do Redis.
 * A conexão é iniciada na primeira chamada.
 */
export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,   // AGORA HABILITADO
      retryStrategy: (times) => {
        // Tenta reconectar a cada 2 segundos, até 10 vezes
        if (times > 10) {
          console.error('Redis connection failed after 10 retries');
          return null; // desiste
        }
        return Math.min(times * 200, 2000);
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis TCP connection established');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis ready to accept commands');
    });
  }
  return redisClient;
}

/**
 * Aguarda até que a conexão Redis esteja pronta para receber comandos.
 * Deve ser chamada antes de qualquer operação crítica (ex.: blpop, rpush, duplicate).
 */
export async function waitForRedisReady(): Promise<void> {
  const client = getRedis();
  if (client.status === 'ready') {
    return;
  }
  if (readyPromise) {
    return readyPromise;
  }
  readyPromise = new Promise<void>((resolve, reject) => {
    if (client.status === 'ready') {
      resolve();
      return;
    }
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      client.off('ready', onReady);
      client.off('error', onError);
      readyPromise = null;
    };
    client.once('ready', onReady);
    client.once('error', onError);
  });
  return readyPromise;
}

/**
 * Fecha a conexão Redis de forma graciosa.
 */
export async function closeRedis(): Promise<void> {
  if (readyPromise) {
    await readyPromise.catch(() => {});
  }
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    readyPromise = null;
  }
}