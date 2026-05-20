import { getRedis } from './redis.js';

const CAMPAIGNS_CACHE_TTL = 5 * 60; // 5 minutes in seconds

interface CampaignListCacheEntry {
  tenantId: string;
  status?: string;
  limit: number;
  offset: number;
}

export async function getCampaignsCache(entry: CampaignListCacheEntry): Promise<any> {
  const redis = getRedis();
  const key = generateCampaignsKey(entry);

  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.error('Error reading campaigns cache:', err);
    return null;
  }
}

export async function setCampaignsCache(entry: CampaignListCacheEntry, data: any): Promise<void> {
  const redis = getRedis();
  const key = generateCampaignsKey(entry);

  try {
    await redis.setex(key, CAMPAIGNS_CACHE_TTL, JSON.stringify(data));
  } catch (err) {
    console.error('Error writing campaigns cache:', err);
  }
}

export async function invalidateCampaignsCache(tenantId: string): Promise<void> {
  const redis = getRedis();

  try {
    const pattern = `campaigns:${tenantId}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('Error invalidating campaigns cache:', err);
  }
}

function generateCampaignsKey(entry: CampaignListCacheEntry): string {
  const statusPart = entry.status ? `:${entry.status}` : '';
  return `campaigns:${entry.tenantId}:list${statusPart}:${entry.limit}:${entry.offset}`;
}
