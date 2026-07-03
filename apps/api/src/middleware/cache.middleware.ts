import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../lib/redis.js';

/**
 * HTTP response cache middleware.
 *
 * Attach to any route with `cacheMiddleware({ ttl })`.
 * - Generates key: `cache:http:<tenantId>:<method>:<path>:<query>`
 * - Skips non-GET requests and requests without tenant.
 * - Falls back silently on Redis errors (cache is best-effort).
 */

export interface CacheOptions {
  /** TTL in seconds. Default: 60. */
  ttl: number;
}

const DEFAULT_TTL = 60;

function buildKey(req: Request): string | null {
  const tenantId = req.user?.tenantId || req.tenant?.tenantId;
  if (!tenantId || req.method !== 'GET') return null;
  const path = req.baseUrl + (req.path || '');
  // ponytail: JSON.stringify for query normalization is O(n), fine for typical
  // query params (~100 chars). Sorted keys for deterministic cache hits.
  const query = Object.keys(req.query).length > 0
    ? ':' + JSON.stringify(req.query, Object.keys(req.query).sort())
    : '';
  return `cache:http:${tenantId}:${req.method}:${path}${query}`;
}

export function cacheMiddleware(opts: CacheOptions) {
  const ttl = opts.ttl ?? DEFAULT_TTL;

  return async function cacheHandler(req: Request, res: Response, next: NextFunction) {
    const key = buildKey(req);
    if (!key) return next();

    const redis = getRedis();

    // Try serve cached
    try {
      const cached = await redis.get(key);
      if (cached) {
        const entry = JSON.parse(cached) as { body: unknown; contentType: string };
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', entry.contentType);
        return res.json(entry.body);
      }
    } catch {
      // Redis error → skip cache, continue normally
    }

    // ponytail: monkey-patch res.json to capture response, write back to Redis,
    // and fire-and-forget (no await). If Redis write fails, user already got response.
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      res.setHeader('X-Cache', 'MISS');
      originalJson(body);

      // Fire-and-forget cache write
      const redis2 = getRedis();
      const entry = { body, contentType: res.getHeader('Content-Type') || 'application/json' };
      redis2.setex(key!, ttl, JSON.stringify(entry)).catch(() => {
        // best-effort: Redis write failure is silent
      });
      return res;
    } as typeof res.json;

    next();
  };
}