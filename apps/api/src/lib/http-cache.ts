import { getRedis } from './redis.js';

/**
 * Invalidação do cache HTTP por tenant + prefixo de rota.
 *
 * Usa SCAN (não KEYS) para não bloquear o Redis. Best-effort: falha loga,
 * nunca lança — a resposta nova já foi gerada, o cache velho expira no TTL.
 */
export async function invalidateHttpCache(
  tenantId: string,
  pathPrefixes: string[]
): Promise<void> {
  const redis = getRedis();
  try {
    for (const prefix of pathPrefixes) {
      const pattern = `cache:http:${tenantId}:GET:${prefix}*`;
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
        cursor = next;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    }
  } catch (err) {
    console.error('[cache] falha ao invalidar cache http:', tenantId, pathPrefixes, err);
  }
}
