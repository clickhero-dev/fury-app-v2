import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { campaigns, db, furyInsights, metaConnections } from '@fury/db';
import type { CampaignSyncJobPayload } from '../lib/queue.js';


const META_API_VERSION = 'v20.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const MOCK_ACCESS_TOKEN = process.env.META_TEST_TOKEN || 'mock-token';
const MOCK_AD_ACCOUNT = process.env.META_TEST_AD_ACCOUNT || 'act_123456';

type MetaApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    type?: string;
    error_subcode?: number;
  };
};

type MetaApiError = Error & {
  metaCode?: number;
  delay?: number;
};
function mapMetaCampaignStatus(status: unknown): 'draft' | 'active' | 'paused' | 'archived' {
  const s = String(status ?? '').toUpperCase();
  if (s === 'ACTIVE') return 'active';
  if (s === 'PAUSED') return 'paused';
  if (s === 'ARCHIVED') return 'archived';
  return 'draft';
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function metaGetJson<T>(path: string): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', MOCK_ACCESS_TOKEN);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const json = (await res.json()) as unknown;

  // Meta often returns 200 with { error: ... } payload.
  const maybeErr = json as MetaApiErrorPayload;
  if (!res.ok || maybeErr?.error) {
    const code = maybeErr?.error?.code;
    const message =
      maybeErr?.error?.message ||
      (typeof json === 'object' ? JSON.stringify(json) : String(json));
    const err = new Error(`[Meta] ${code ?? res.status}: ${message}`);
    (err as MetaApiError).metaCode = code;
    throw err;
  }

  return json as T;
}

type MetaCampaign = {
  id: string;
  name?: string;
  status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  objective?: string;
};

type MetaCampaignsResponse = {
  data: MetaCampaign[];
};

type MetaInsightRow = {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  cpp?: string;
  actions?: unknown;
};

type MetaInsightsResponse = {
  data: MetaInsightRow[];
};

async function upsertCampaignByTenantMetaId(args: {
  tenantId: string;
  metaCampaignId: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  budget: Record<string, unknown>;
  metrics: Record<string, unknown>;
}) {
  await db
    .insert(campaigns)
    .values({
      tenantId: args.tenantId,
      metaCampaignId: args.metaCampaignId,
      name: args.name,
      status: args.status,
      budget: args.budget,
      metrics: args.metrics,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [campaigns.tenantId, campaigns.metaCampaignId],
      set: {
        name: args.name,
        status: args.status,
        budget: args.budget,
        metrics: args.metrics,
        lastSyncedAt: new Date(),
      },
    });
}
async function checkCampaignViolations(args: {
  tenantId: string;
  campaignId: string;
  campaignName: string;
  metaCampaignId: string;
  status: string;
  metrics: Record<string, unknown>;
}) {
  if (args.status !== 'active') return;

  const metrics = args.metrics as {
    spend?: number;
    ctr?: number;
    impressions?: number;
    conversions?: number;
    cpa?: number;
  };

  let reason = '';
  let description = '';

  if ((metrics.conversions ?? 0) === 0 && (metrics.spend ?? 0) > 100) {
    reason = 'zero_conversions';
    description = 'Campanha com gasto acima de R$100 sem conversões';
  } else if ((metrics.ctr ?? 0) < 0.3 && (metrics.impressions ?? 0) > 5000) {
    reason = 'low_ctr';
    description = `CTR baixo: ${metrics.ctr}%`;
  }

  if (!reason) return;

  try {
    await fetch(
      `${META_GRAPH_BASE}/${encodeURIComponent(args.metaCampaignId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'PAUSED',
          access_token: MOCK_ACCESS_TOKEN,
        }),
      }
    );

    await db
      .update(campaigns)
      .set({
        status: 'paused',
      })
      .where(eq(campaigns.metaCampaignId, args.metaCampaignId));

  } catch (error) {
    console.error(
      '[Smart Takedown] erro ao pausar campanha:',
      error
    );

    return;
  }

  await db.insert(furyInsights).values({
    tenantId: args.tenantId,
    campaignId: args.campaignId,
    suggestionType: 'smart_takedown',
    suggestionData: {
      reason,
      description,
      campaignName: args.campaignName,
      autoApplied: true,
      metrics,
    },
  });

  console.log(
    `[Smart Takedown] ${args.campaignName} -> ${reason}`
  );
}

export function createCampaignSyncWorker(connection: IORedis) {
  return new Worker<CampaignSyncJobPayload>(
    'campaign-sync',
    async (job) => {
      if (job.name !== 'syncCampaigns') {
        return;
      }

      const { tenantId, metaConnectionId } = job.data;

      const now = new Date();
      const metaConn = await db.query.metaConnections.findFirst({
        where: and(eq(metaConnections.id, metaConnectionId), eq(metaConnections.tenantId, tenantId)),
      });
       
      if (!metaConn) {
        throw new Error(`[campaign-sync] meta_connection not found: ${metaConnectionId}`);
      }

      // TODO: integrar com OAuth real.
      // - Descriptografar metaConn.accessToken
      // - Substituir MOCK_ACCESS_TOKEN por token dinâmico.


      // Only run when "active" per agreed rules: token_expires_at is null OR > now
      if (metaConn.tokenExpiresAt && metaConn.tokenExpiresAt <= now) {
        console.warn(
          `[campaign-sync] meta_connection expired (token_expires_at <= now), skipping: ${metaConnectionId}`
        );
        return;
      }

      let campaignsResp: MetaCampaignsResponse;
      try {
        campaignsResp = await metaGetJson<MetaCampaignsResponse>(
          `/${encodeURIComponent(MOCK_AD_ACCOUNT)}/campaigns?fields=id,name,status,daily_budget,lifetime_budget,objective`
        );
      } catch (err) {
        const code = (err as MetaApiError).metaCode;

        if (code === 17 || code === 80004) {
          // Rate limit: retry after 5 minutes
          throw Object.assign(err as Error, { delay: 5 * 60 * 1000 });
        }

        if (code === 190) {
          await db
            .update(metaConnections)
            .set({ tokenExpiresAt: new Date() })
            .where(eq(metaConnections.id, metaConnectionId));
          console.warn(`[campaign-sync] Meta token expired (190). Marked expired: ${metaConnectionId}`);
          return;
        }

        console.error('[campaign-sync] Meta campaigns fetch failed:', (err as Error).message);
        throw err;
      }

      const list = campaignsResp?.data ?? [];

      for (const c of list) {
        if (!c?.id) continue;

        let insightsResp: MetaInsightsResponse;
        try {
          insightsResp = await metaGetJson<MetaInsightsResponse>(
            `/${encodeURIComponent(c.id)}/insights?fields=spend,impressions,clicks,ctr,cpm,cpp,actions&date_preset=last_7d`
          );
        } catch (err) {
          const code = (err as MetaApiError).metaCode;

          if (code === 17 || code === 80004) {
            throw Object.assign(err as Error, { delay: 5 * 60 * 1000 });
          }

          if (code === 190) {
            await db
              .update(metaConnections)
              .set({ tokenExpiresAt: new Date() })
              .where(eq(metaConnections.id, metaConnectionId));
            console.warn(`[campaign-sync] Meta token expired (190). Marked expired: ${metaConnectionId}`);
            return;
          }

          console.error('[campaign-sync] Meta insights fetch failed:', (err as Error).message);
          throw err;
        }

        const insight = insightsResp?.data?.[0] ?? {};
        const metrics: Record<string, unknown> = {
          spend: toNumberOrUndefined(insight.spend),
          impressions: toNumberOrUndefined(insight.impressions),
          clicks: toNumberOrUndefined(insight.clicks),
          ctr: toNumberOrUndefined(insight.ctr),
          cpm: toNumberOrUndefined(insight.cpm),
          cpp: toNumberOrUndefined(insight.cpp),
          actions: insight.actions ?? [],
          datePreset: 'last_7d',
          source: 'meta',
          syncedAt: now.toISOString(),
        };

        const budget: Record<string, unknown> = {
          daily_budget: c.daily_budget ?? null,
          lifetime_budget: c.lifetime_budget ?? null,
          objective: c.objective ?? null,
        };

        await upsertCampaignByTenantMetaId({
          tenantId,
          metaCampaignId: c.id,
          name: c.name ?? '(sem nome)',
          status: mapMetaCampaignStatus(c.status),
          budget,
          metrics,
        });
        await checkCampaignViolations({
          tenantId,
          campaignId: c.id,
          campaignName: c.name ?? '(sem nome)',
          metaCampaignId: c.id,
          status: mapMetaCampaignStatus(c.status),
          metrics,
        });
      }
      console.log(
        `[campaign-sync] synced ${list.length} campaigns for tenant ${tenantId}`
      );
    },
    {
      connection,
      // We implement retry delays via `err.delay` on rate limit errors.
      settings: {
        backoffStrategy: (attemptsMade, type, err) => {
          const delay = (err as MetaApiError | undefined)?.delay;
          if (typeof delay === 'number') return delay;
          return Math.min(30_000, attemptsMade * 2_000);
        },
      },
    }
  );
}

export async function listActiveMetaConnections() {
  const now = new Date();
  return db
    .select({
      id: metaConnections.id,
      tenantId: metaConnections.tenantId,
    })
    .from(metaConnections)
    .where(or(isNull(metaConnections.tokenExpiresAt), gt(metaConnections.tokenExpiresAt, now)));
}

