import { getRedis } from './redis.js';
import type { CacheKey } from '../types/observability.types.js';

const CACHE_TTL_SECONDS = 60; // As specified in requirements

/**
 * Generates a cache key for observability KPIs
 * Format: "observability:{type}:{tenantId}:{startDate}:{endDate}"
 */
function generateCacheKey(key: CacheKey): string {
  const parts = [
    'observability',
    key.type,
    key.tenantId || 'all',
    key.startDate || 'default',
    key.endDate || 'default',
  ];
  return parts.join(':');
}

/**
 * Get cached KPI data from Redis
 */
export async function getCachedKPI(key: CacheKey): Promise<any | null> {
  try {
    const redis = getRedis();
    const cacheKey = generateCacheKey(key);
    const cached = await redis.get(cacheKey);

    if (!cached) {
      return null;
    }

    return JSON.parse(cached);
  } catch (error) {
    console.error('Cache get error:', error);
    // Fail open: if cache fails, return null and let service fetch fresh data
    return null;
  }
}

/**
 * Set KPI data in Redis cache with TTL
 */
export async function setCachedKPI(key: CacheKey, data: any): Promise<void> {
  try {
    const redis = getRedis();
    const cacheKey = generateCacheKey(key);
    const jsonData = JSON.stringify(data);

    // Set with TTL (seconds)
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, jsonData);
  } catch (error) {
    console.error('Cache set error:', error);
    // Fail silently: cache is non-critical
  }
}

/**
 * Invalidate all observability cache entries
 */
export async function invalidateObservabilityCache(): Promise<void> {
  try {
    const redis = getRedis();
    const pattern = 'observability:*';
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

/**
 * Invalidate cache for specific cache type
 */
export async function invalidateObservabilityCacheByType(type: string): Promise<void> {
  try {
    const redis = getRedis();
    const pattern = `observability:${type}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}
