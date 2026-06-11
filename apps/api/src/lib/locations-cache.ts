import { getRedis } from './redis.js';
import type { MetaLocationResult } from './meta-api.js';

const META_LOCATIONS_CACHE_TTL = 60 * 60; // 1 hour in seconds

function generateLocationsKey(query: string): string {
  return `meta-locations:${query.trim().toLowerCase()}`;
}

export async function getMetaLocationsCache(query: string): Promise<MetaLocationResult[] | null> {
  const redis = getRedis();

  try {
    const cached = await redis.get(generateLocationsKey(query));
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.error('Error reading meta locations cache:', err);
    return null;
  }
}

export async function setMetaLocationsCache(query: string, data: MetaLocationResult[]): Promise<void> {
  const redis = getRedis();

  try {
    await redis.setex(generateLocationsKey(query), META_LOCATIONS_CACHE_TTL, JSON.stringify(data));
  } catch (err) {
    console.error('Error writing meta locations cache:', err);
  }
}
