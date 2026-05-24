import { and, desc, eq } from 'drizzle-orm';
import { automationRules, campaigns, db, furyInsights, metaConnections } from '../lib/db.js';
import { metaApiCall, decryptAccessToken, type MetaCampaignCreateResponse } from '../lib/meta-api.js';
import { AppError } from '../middleware/errorHandler.js';

export async function createCampaign(args: {
  tenantId: string;
  name: string;
  objective: 'OUTCOME_SALES' | 'OUTCOME_LEADS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_AWARENESS';
  dailyBudget: number;
  adAccountId: string;
}) {
  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, args.tenantId),
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found for this tenant');
  }

  const adAccounts = (metaConn.adAccounts as { id: string }[]) || [];
  const accountExists = adAccounts.some((acc) => acc.id === args.adAccountId);

  if (!accountExists) {
    throw new AppError(403, 'AD_ACCOUNT_NOT_FOUND', 'Ad account does not belong to this tenant');
  }

  const accessToken = decryptAccessToken(metaConn.accessToken);

  try {
    const response = await metaApiCall<MetaCampaignCreateResponse>(
      `/${encodeURIComponent(args.adAccountId)}/campaigns`,
      accessToken,
      {
        method: 'POST',
        body: {
          name: args.name,
          objective: args.objective,
          status: 'PAUSED',
          special_ad_categories: [],
        },
      }
    );

    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: args.tenantId,
        metaCampaignId: response.id,
        name: args.name,
        status: 'paused',
        budget: { daily_budget: args.dailyBudget, objective: args.objective },
      })
      .returning();

    return campaign;
  } catch (err) {
    const metaCode = (err as any).metaCode;

    if (metaCode === 190) {
      throw new AppError(
        401,
        'META_TOKEN_EXPIRED',
        'Token Meta expirado. Reconecte sua conta em Configurações > Integrações'
      );
    }

    if (metaCode === 100) {
      throw new AppError(400, 'INVALID_PARAMETER', (err as Error).message);
    }

    throw err;
  }
}

export async function pauseCampaign(args: { tenantId: string; campaignId: string }) {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, args.campaignId),
  });

  if (!campaign) {
    throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  }

  if (campaign.tenantId !== args.tenantId) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
  }

  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, args.tenantId),
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found');
  }

  const accessToken = decryptAccessToken(metaConn.accessToken);

  try {
    await metaApiCall(
      `/${encodeURIComponent(campaign.metaCampaignId)}`,
      accessToken,
      {
        method: 'POST',
        body: { status: 'PAUSED' },
      }
    );
  } catch (err) {
    const metaCode = (err as any).metaCode;

    if (metaCode === 190) {
      throw new AppError(
        401,
        'META_TOKEN_EXPIRED',
        'Token Meta expirado. Reconecte sua conta em Configurações > Integrações'
      );
    }

    throw err;
  }

  await db
    .update(campaigns)
    .set({ status: 'paused' })
    .where(eq(campaigns.id, args.campaignId));

  await db
    .insert(furyInsights)
    .values({
      tenantId: args.tenantId,
      campaignId: args.campaignId,
      suggestionType: 'campaign_pause',
      suggestionData: { reason: 'manual', autoApplied: false },
    });

  return { status: 'PAUSED' as const };
}

export async function resumeCampaign(args: { tenantId: string; campaignId: string }) {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, args.campaignId),
  });

  if (!campaign) {
    throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  }

  if (campaign.tenantId !== args.tenantId) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
  }

  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, args.tenantId),
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found');
  }

  const accessToken = decryptAccessToken(metaConn.accessToken);

  try {
    await metaApiCall(
      `/${encodeURIComponent(campaign.metaCampaignId)}`,
      accessToken,
      {
        method: 'POST',
        body: { status: 'ACTIVE' },
      }
    );
  } catch (err) {
    const metaCode = (err as any).metaCode;

    if (metaCode === 190) {
      throw new AppError(
        401,
        'META_TOKEN_EXPIRED',
        'Token Meta expirado. Reconecte sua conta em Configurações > Integrações'
      );
    }

    throw err;
  }

  await db
    .update(campaigns)
    .set({ status: 'active' })
    .where(eq(campaigns.id, args.campaignId));

  await db
    .insert(furyInsights)
    .values({
      tenantId: args.tenantId,
      campaignId: args.campaignId,
      suggestionType: 'campaign_resume',
      suggestionData: { reason: 'manual', autoApplied: false },
    });

  return { status: 'ACTIVE' as const };
}

export async function updateCampaignBudget(args: {
  tenantId: string;
  campaignId: string;
  dailyBudget: number;
}) {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, args.campaignId),
  });

  if (!campaign) {
    throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  }

  if (campaign.tenantId !== args.tenantId) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
  }

  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, args.tenantId),
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found');
  }

  const accessToken = decryptAccessToken(metaConn.accessToken);

  try {
    await metaApiCall(
      `/${encodeURIComponent(campaign.metaCampaignId)}`,
      accessToken,
      {
        method: 'POST',
        body: { daily_budget: args.dailyBudget },
      }
    );
  } catch (err) {
    const metaCode = (err as any).metaCode;

    if (metaCode === 190) {
      throw new AppError(
        401,
        'META_TOKEN_EXPIRED',
        'Token Meta expirado. Reconecte sua conta em Configurações > Integrações'
      );
    }

    throw err;
  }

  const [updatedCampaign] = await db
    .update(campaigns)
    .set({
      budget: {
        ...(campaign.budget as Record<string, unknown>),
        daily_budget: args.dailyBudget,
      },
    })
    .where(eq(campaigns.id, args.campaignId))
    .returning();

  return updatedCampaign;
}

export interface CampaignPanelMetrics {
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  conversions: number;
  impressions: number;
}

export interface TakedownItem {
  id: string;
  campaignId: string;
  suggestionType: string;
  suggestionData: Record<string, unknown>;
  appliedAt: string | null;
  createdAt: string;
}

export interface AutomationRuleItem {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  trigger: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  ruleType: string;
  isActive: boolean;
  threshold: number;
  action: string;
}

function normalizeCampaignPanelMetrics(raw: unknown): CampaignPanelMetrics {
  const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
    return Number.isFinite(n) ? n : 0;
  };
  return {
    spend: num(m.spend),
    roas: num(m.roas),
    cpa: num(m.cpa),
    ctr: num(m.ctr),
    cpm: num(m.cpm),
    conversions: num(m.conversions),
    impressions: num(m.impressions),
  };
}

export async function getCampaign(args: { tenantId: string; campaignId: string }) {
  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, args.campaignId), eq(campaigns.tenantId, args.tenantId)),
  });

  if (!campaign) {
    throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  }

  return campaign;
}

export async function getCampaignPanelDetail(args: {
  tenantId: string;
  campaignId: string;
}): Promise<{
  campaign: {
    id: string;
    name: string;
    status: string;
    objective: string | null;
    budget: unknown;
    metaCampaignId: string;
    metrics: CampaignPanelMetrics;
    lastSyncedAt: string | null;
    createdAt: string;
  };
  recentTakedowns: TakedownItem[];
  automationRules: AutomationRuleItem[];
} | null> {
  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, args.campaignId), eq(campaigns.tenantId, args.tenantId)),
  });

  if (!campaign) {
    return null;
  }

  const recentTakedownsRows = await db.query.furyInsights.findMany({
    where: and(
      eq(furyInsights.tenantId, args.tenantId),
      eq(furyInsights.campaignId, args.campaignId),
      eq(furyInsights.suggestionType, 'smart_takedown'),
    ),
    orderBy: [desc(furyInsights.createdAt)],
    limit: 5,
  });

  const rulesRows = await db.query.automationRules.findMany({
    where: and(eq(automationRules.tenantId, args.tenantId), eq(automationRules.isActive, true)),
    orderBy: [desc(automationRules.updatedAt)],
  });

  const budgetObj = campaign.budget as Record<string, unknown> | null | undefined;
  const objective =
    budgetObj && typeof budgetObj.objective === 'string' ? budgetObj.objective : null;

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      objective,
      budget: campaign.budget ?? {},
      metaCampaignId: campaign.metaCampaignId,
      metrics: normalizeCampaignPanelMetrics(campaign.metrics),
      lastSyncedAt: campaign.lastSyncedAt?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
    },
    recentTakedowns: recentTakedownsRows.map((t) => ({
      id: t.id,
      campaignId: t.campaignId,
      suggestionType: t.suggestionType,
      suggestionData: (t.suggestionData as Record<string, unknown>) ?? {},
      appliedAt: t.appliedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    automationRules: rulesRows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      name: r.name,
      description: r.description,
      trigger: r.trigger,
      enabled: r.enabled === 'true',
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      ruleType: r.ruleType,
      isActive: r.isActive,
      threshold: parseFloat(String(r.threshold)) || 0,
      action: r.action,
    })),
  };
}
