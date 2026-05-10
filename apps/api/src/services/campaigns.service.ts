import { eq } from 'drizzle-orm';
import { db, campaigns, metaConnections, furyInsights } from '@fury/db';
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

  return { success: true };
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

  return { success: true };
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

export async function getCampaign(args: { tenantId: string; campaignId: string }) {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, args.campaignId),
  });

  if (!campaign) {
    throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  }

  if (campaign.tenantId !== args.tenantId) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
  }

  return campaign;
}
