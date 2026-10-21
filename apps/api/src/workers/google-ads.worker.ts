import { Worker } from 'bullmq';
import { eq, isNotNull } from 'drizzle-orm';
import {
  db as dbInstance,
  googleConnections,
  googleBusinessProfiles,
  googleSyncLogs,
} from '../lib/db.js';
import { createGoogleAdsApiClient } from '../lib/google-ads-api.js';
import { decryptToken } from '../utils/crypto.js';

const GOOGLE_ADS_QUEUE_NAME = 'google-ads';

let googleAdsWorkerInstance: Worker<{ timestamp: string }> | null = null;

/** Query GAQL com UNNEST para múltiplos ids de campanha. */
function buildAdsStatusQuery(campaignIds: string[]): string {
  const ids = campaignIds.map((id) => `'${id}'`).join(', ');
  return [
    'SELECT campaign.id, campaign.status, campaign_budget.amount_micros,',
    'customer_asset_set.asset_set, customer_asset_set.status',
    'FROM campaign',
    'LEFT JOIN customer_asset_set ON customer_asset_set.asset_set = campaign.asset_set',
    `WHERE campaign.id IN (${ids || "'0'"})`,
  ].join(' ');
}

/**
 * Sincroniza o status de veiculação das campanhas Ads (Fluxo 3/F4):
 * consulta GoogleAdsService.SearchStream e atualiza google_business_profiles
 * (adsCampaignStatus, adsServedAt) — respeitando quota (worker a cada 15 min).
 */
export async function processAdsStatusJob(): Promise<void> {
  const profilesWithCampaign = await dbInstance.query.googleBusinessProfiles.findMany({
    where: isNotNull(googleBusinessProfiles.adsCampaignId),
  });

  if (profilesWithCampaign.length === 0) return;

  for (const profile of profilesWithCampaign) {
    if (!profile.adsCampaignId) continue;

    try {
      const connection = await dbInstance.query.googleConnections.findFirst({
        where: eq(googleConnections.id, profile.connectionId),
      });
      if (!connection) continue;

      const adsClient = createGoogleAdsApiClient({
        developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
        accessToken: decryptToken(connection.accessToken),
      });

      const rows = await adsClient.searchStream(buildAdsStatusQuery([profile.adsCampaignId]));
      const row = rows[0];
      const campaignStatus = (row?.campaign as { status?: string } | undefined)?.status;

      if (!campaignStatus) continue;

      await dbInstance
        .update(googleBusinessProfiles)
        .set({
          adsCampaignStatus: campaignStatus as 'ENABLED' | 'PAUSED' | 'REMOVED' | 'UNKNOWN',
          adsServedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(googleBusinessProfiles.id, profile.id));

      await dbInstance.insert(googleSyncLogs).values({
        tenantId: profile.tenantId,
        connectionId: connection.id,
        profileId: profile.id,
        operation: 'sync',
        status: 'success',
        message: `Status da campanha Ads: ${campaignStatus}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido na sincronização do Ads.';
      await dbInstance.insert(googleSyncLogs).values({
        tenantId: profile.tenantId,
        connectionId: profile.connectionId,
        profileId: profile.id,
        operation: 'sync',
        status: 'failed',
        message,
      });
    }
  }
}

export async function startGoogleAdsWorker(): Promise<Worker<{ timestamp: string }>> {
  const worker = new Worker<{ timestamp: string }>(
    GOOGLE_ADS_QUEUE_NAME,
    async () => {
      await processAdsStatusJob();
    },
    {
      connection: (await import('../lib/redis.js')).getRedis().duplicate(),
      concurrency: 1,
    }
  );

  worker.on('error', (err) => {
    console.error('[google-ads] Worker error:', err.message);
  });

  googleAdsWorkerInstance = worker;
  return worker;
}

export async function stopGoogleAdsWorker(): Promise<void> {
  if (googleAdsWorkerInstance) {
    await googleAdsWorkerInstance.close();
    googleAdsWorkerInstance = null;
    console.log('🛑 Google-ads worker stopped');
  }
}