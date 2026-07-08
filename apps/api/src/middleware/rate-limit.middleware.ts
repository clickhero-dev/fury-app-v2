import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../lib/redis.js';

/** Máximo de requisições permitidas por janela (padrão: 100/s conforme sprint). */
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 100);

/** Duração da janela em milissegundos (padrão: 1 segundo). */
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 1000);

const KEY_PREFIX = 'rate_limit:';

/**
 * Sliding window atômico no Redis.
 * Remove entradas expiradas, conta requisições na janela e registra a atual se houver espaço.
 * Retorna [permitido (1|0), contagem após operação].
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count >= limit then
  return {0, count}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1}
`;

let scriptSha: string | null = null;

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function isRateLimitSkipped(req: Request): boolean {
  if (process.env.RATE_LIMIT_ENABLED === 'false') {
    return true;
  }

  // Health checks de load balancer não devem consumir cota
  return req.path === '/health' || req.path === '/health/';
}

async function loadScript(): Promise<string> {
  const redis = getRedis();
  scriptSha = (await redis.script('LOAD', SLIDING_WINDOW_SCRIPT)) as string;
  return scriptSha;
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; count: number }> {
  const redis = getRedis();
  const key = `${KEY_PREFIX}${ip}`;
  const now = Date.now();
  const member = `${now}:${Math.random().toString(36).slice(2)}`;

  if (!scriptSha) {
    await loadScript();
  }

  const runScript = async (): Promise<[number, number]> => {
    return redis.evalsha(scriptSha!, 1, key, now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, member) as Promise<
      [number, number]
    >;
  };

  try {
    const [allowed, count] = await runScript();
    return { allowed: allowed === 1, count };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('NOSCRIPT')) {
      await loadScript();
      const [allowed, count] = await runScript();
      return { allowed: allowed === 1, count };
    }
    throw err;
  }
}

function setRateLimitHeaders(res: Response, count: number, allowed: boolean): void {
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Window', `${RATE_LIMIT_WINDOW_MS}ms`);
  res.setHeader('X-RateLimit-Remaining', allowed ? Math.max(0, RATE_LIMIT_MAX - count) : 0);

  if (!allowed) {
    res.setHeader('Retry-After', Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
  }
}

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'test' || isRateLimitSkipped(req)) {
    return next();
  }

  const ip = getClientIp(req);

  try {
    const { allowed, count } = await checkRateLimit(ip);
    setRateLimitHeaders(res, count, allowed);

    if (!allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Maximum ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 1000} second(s) allowed.`,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return next();
  } catch (err) {
    console.error('Rate limit check failed, allowing request:', err);
    // Fail-open: indisponibilidade do Redis não derruba a API
    return next();
  }
}

export async function checkEmailVerificationRateLimit(email: string): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedis();
  const key = `verify_email:${email}`;
  const maxAttempts = 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes

  try {
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.pexpire(key, windowMs);
    }

    const allowed = current <= maxAttempts;
    const remaining = Math.max(0, maxAttempts - current);

    return { allowed, remaining };
  } catch (err) {
    console.error('Email verification rate limit check failed, allowing request:', err);
    return { allowed: true, remaining: maxAttempts };
  }
}
