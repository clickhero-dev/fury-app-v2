import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../lib/redis.js';

/**
 * HTTP response cache middleware.
 *
 * Attach to any route with `cacheMiddleware({ ttl })`.
 * - Generates key: `cache:http:<tenantId>:<method>:<path>:<query>`
 * - Skips non-GET requests and requests without tenant.
 * - Never caches error responses (status >= 400) — 401s from expired
 *   sessions must not poison the cache for the next request.
 * - Falls back silently on Redis read errors (cache is best-effort);
 *   write errors are logged but never break the response.
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
  // Sorted JSON for deterministic keys: same query in any param order must
  // produce the SAME cache key (hit), nested objects included.
  const query = Object.keys(req.query).length > 0
    ? ':' + stableStringify(req.query)
    : '';
  return `cache:http:${tenantId}:${req.method}:${path}${query}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
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
      // Redis read error → skip cache, continue normally
    }

    // Wrap res.json: capture the response and write it back to Redis
    // fire-and-forget. Only 2xx responses are cached.
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      originalJson(body);

      const status = res.statusCode;
      if (status >= 400) return res; // 4xx/5xx (ex.: 401 sessão expirada) não são cacheados

      const redis2 = getRedis();
      const entry = { body, contentType: res.getHeader('Content-Type') || 'application/json' };
      redis2.setex(key!, ttl, JSON.stringify(entry)).catch((err: unknown) => {
        console.error('[cache] falha ao gravar resposta no redis:', key, err);
      });
      return res;
    } as typeof res.json;

    res.setHeader('X-Cache', 'MISS');
    next();
  };
}
