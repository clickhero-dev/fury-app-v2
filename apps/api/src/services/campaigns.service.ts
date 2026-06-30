import { and, desc, eq, isNull } from 'drizzle-orm';
import { automationRules, campaigns, creativeAssets, db, furyInsights, metaConnections } from '../lib/db.js';
import {
  metaApiCall,
  getMetaInsights,
  searchMetaCityLocations,
  uploadAdImage,
  type MetaCampaignCreateResponse,
  type MetaLocationResult,
} from '../lib/meta-api.js';
import { decryptMetaToken } from '../utils/crypto.js';
import {
  parseConversionsFromActions,
  parseRoasFromPurchaseRoas,
  parseCpaFromCostPerAction,
} from '../utils/meta-insights-parser.js';
import { roundToDecimals } from '../utils/metrics-formatter.js';
import { AppError } from '../middleware/errorHandler.js';
import { invalidateCampaignsCache } from '../lib/campaigns-cache.js';
import { getMetaLocationsCache, setMetaLocationsCache } from '../lib/locations-cache.js';
import { getResolvedTenantAssetSelection } from './meta.service.js';

export async function createCampaign(args: {
  tenantId: string;
  name: string;
  objective: 'OUTCOME_SALES' | 'OUTCOME_LEADS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_AWARENESS';
  dailyBudget: number;
  adAccountId: string;
}) {
  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, args.tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found for this tenant');
  }

  const adAccounts = (metaConn.adAccounts as { id: string }[]) || [];
  const accountExists = adAccounts.some((acc) => acc.id === args.adAccountId);

  if (!accountExists) {
    throw new AppError(403, 'AD_ACCOUNT_NOT_FOUND', 'Ad account does not belong to this tenant');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

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
          is_adset_budget_sharing_enabled: false,
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
  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, args.tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found for this tenant');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

  // Verify the campaign belongs to one of this tenant's ad accounts
  try {
    const campaignMeta = await metaApiCall<{ account_id?: string }>(
      `/${encodeURIComponent(args.campaignId)}?fields=account_id`,
      accessToken
    );
    if (campaignMeta.account_id) {
      const normalize = (id: string) => id.replace(/^act_/, '');
      const adAccounts = (metaConn.adAccounts as { id: string }[]) || [];
      const owned = adAccounts.some(
        (acc) => normalize(acc.id) === normalize(campaignMeta.account_id!)
      );
      if (!owned) {
        throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
      }
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    const metaCode = (err as any).metaCode;
    if (metaCode === 190) {
      throw new AppError(401, 'META_TOKEN_EXPIRED', 'Token Meta expirado. Reconecte sua conta em Configurações > Integrações');
    }
    throw err;
  }

  try {
    await metaApiCall(
      `/${encodeURIComponent(args.campaignId)}`,
      accessToken,
      { method: 'POST', body: { status: 'PAUSED' } }
    );
  } catch (err) {
    const metaCode = (err as any).metaCode;
    if (metaCode === 190) {
      throw new AppError(401, 'META_TOKEN_EXPIRED', 'Token Meta expirado. Reconecte sua conta em Configurações > Integrações');
    }
    throw err;
  }

  return { campaignId: args.campaignId, status: 'PAUSED' as const };
}

export async function resumeCampaign(args: { tenantId: string; campaignId: string }) {
  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, args.tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found for this tenant');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

  // Verify the campaign belongs to one of this tenant's ad accounts
  try {
    const campaignMeta = await metaApiCall<{ account_id?: string }>(
      `/${encodeURIComponent(args.campaignId)}?fields=account_id`,
      accessToken
    );
    if (campaignMeta.account_id) {
      const normalize = (id: string) => id.replace(/^act_/, '');
      const adAccounts = (metaConn.adAccounts as { id: string }[]) || [];
      const owned = adAccounts.some(
        (acc) => normalize(acc.id) === normalize(campaignMeta.account_id!)
      );
      if (!owned) {
        throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
      }
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    const metaCode = (err as any).metaCode;
    if (metaCode === 190) {
      throw new AppError(401, 'META_TOKEN_EXPIRED', 'Token Meta expirado. Reconecte sua conta em Configurações > Integrações');
    }
    throw err;
  }

  try {
    await metaApiCall(
      `/${encodeURIComponent(args.campaignId)}`,
      accessToken,
      { method: 'POST', body: { status: 'ACTIVE' } }
    );
  } catch (err) {
    const metaCode = (err as any).metaCode;
    if (metaCode === 190) {
      throw new AppError(401, 'META_TOKEN_EXPIRED', 'Token Meta expirado. Reconecte sua conta em Configurações > Integrações');
    }
    throw err;
  }

  return { campaignId: args.campaignId, status: 'ACTIVE' as const };
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
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

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
      enabled: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      ruleType: r.ruleType,
      isActive: r.isActive,
      threshold: parseFloat(String(r.threshold)) || 0,
      action: r.action,
    })),
  };
}

export interface CampaignListItem {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  budget: unknown;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  roas: number;
  cpa: number;
  conversions: number;
}

export async function getCampaigns(args: {
  tenantId: string;
  status?: string;
  limit: number;
  offset: number;
}): Promise<{ items: CampaignListItem[]; total: number }> {
  const filters = [eq(campaigns.tenantId, args.tenantId)];

  if (args.status) {
    filters.push(eq(campaigns.status, args.status as any));
  }

  const items = await db.query.campaigns.findMany({
    where: and(...filters),
    limit: args.limit,
    offset: args.offset,
    orderBy: [desc(campaigns.createdAt)],
  });

  const countResult = await db.query.campaigns.findMany({
    where: and(...filters),
  });

  return {
    items: items.map((c) => formatCampaignListItem(c)),
    total: countResult.length,
  };
}

function formatCampaignListItem(campaign: any): CampaignListItem {
  const budgetObj = campaign.budget as Record<string, unknown> | null | undefined;
  const metricsObj = campaign.metrics as Record<string, unknown> | null | undefined;
  const objective =
    budgetObj && typeof budgetObj.objective === 'string' ? budgetObj.objective : null;

  const getMetric = (key: string): number => {
    if (!metricsObj) return 0;
    const val = metricsObj[key];
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const num = parseFloat(val);
      return Number.isFinite(num) ? num : 0;
    }
    return 0;
  };

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    objective,
    budget: campaign.budget ?? {},
    spend: getMetric('spend'),
    impressions: getMetric('impressions'),
    clicks: getMetric('clicks'),
    ctr: getMetric('ctr'),
    cpc: getMetric('cpc'),
    roas: getMetric('roas'),
    cpa: getMetric('cpa'),
    conversions: getMetric('conversions'),
  };
}

export async function updateCampaign(args: {
  tenantId: string;
  campaignId: string;
  name?: string;
  budget?: { amount: number; type: 'daily' | 'lifetime'; startDate?: string; endDate?: string };
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
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);
  const updateBody: Record<string, unknown> = {};

  if (args.name) {
    updateBody.name = args.name;
  }

  if (args.budget) {
    updateBody[args.budget.type === 'daily' ? 'daily_budget' : 'lifetime_budget'] = args.budget.amount;
    if (args.budget.startDate) updateBody.start_date = args.budget.startDate;
    if (args.budget.endDate) updateBody.end_date = args.budget.endDate;
  }

  try {
    await metaApiCall(
      `/${encodeURIComponent(campaign.metaCampaignId)}`,
      accessToken,
      {
        method: 'POST',
        body: updateBody,
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

  const budgetObj = campaign.budget as Record<string, unknown>;
  const updatedBudget = { ...budgetObj };

  if (args.name) {
    const [updated] = await db
      .update(campaigns)
      .set({ name: args.name })
      .where(eq(campaigns.id, args.campaignId))
      .returning();
    return updated;
  }

  if (args.budget) {
    if (args.budget.type === 'daily') {
      updatedBudget.daily_budget = args.budget.amount;
    } else {
      updatedBudget.lifetime_budget = args.budget.amount;
    }
    if (args.budget.startDate) updatedBudget.start_date = args.budget.startDate;
    if (args.budget.endDate) updatedBudget.end_date = args.budget.endDate;

    const [updated] = await db
      .update(campaigns)
      .set({ budget: updatedBudget })
      .where(eq(campaigns.id, args.campaignId))
      .returning();
    return updated;
  }

  return campaign;
}

export async function updateCampaignStatus(args: {
  tenantId: string;
  campaignId: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  userId: string;
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
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

  try {
    await metaApiCall(
      `/${encodeURIComponent(campaign.metaCampaignId)}`,
      accessToken,
      {
        method: 'POST',
        body: { status: args.status },
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

  const localStatus = args.status === 'ACTIVE' ? 'active' : args.status === 'PAUSED' ? 'paused' : 'archived';

  const [updated] = await db
    .update(campaigns)
    .set({ status: localStatus as any })
    .where(eq(campaigns.id, args.campaignId))
    .returning();

  await db.insert(furyInsights).values({
    tenantId: args.tenantId,
    campaignId: args.campaignId,
    suggestionType: `campaign_status_${args.status.toLowerCase()}`,
    suggestionData: { userId: args.userId, timestamp: new Date().toISOString(), action: 'manual' },
  });

  return updated;
}

export async function softDeleteCampaign(args: { tenantId: string; campaignId: string; userId: string }) {
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
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

  try {
    await metaApiCall(
      `/${encodeURIComponent(campaign.metaCampaignId)}`,
      accessToken,
      {
        method: 'POST',
        body: { status: 'ARCHIVED' },
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

  const [deleted] = await db
    .update(campaigns)
    .set({ status: 'archived' })
    .where(eq(campaigns.id, args.campaignId))
    .returning();

  await db.insert(furyInsights).values({
    tenantId: args.tenantId,
    campaignId: args.campaignId,
    suggestionType: 'campaign_archived',
    suggestionData: { userId: args.userId, timestamp: new Date().toISOString(), action: 'manual' },
  });

  return deleted;
}

export async function getCampaignInsights(args: {
  tenantId: string;
  campaignId: string; // Meta campaign ID
  dateRange: 'last_7d' | 'last_30d' | 'last_90d' | 'custom';
  startDate?: string;
  endDate?: string;
}) {
  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, args.tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

  // Try DB for cached name/status, fall back to Meta API
  const dbCampaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.metaCampaignId, args.campaignId), eq(campaigns.tenantId, args.tenantId)),
  });

  let campaignBlock: { id: string; name: string; status: string } = {
    id: args.campaignId,
    name: `Campaign ${args.campaignId}`,
    status: 'ACTIVE',
  };
  let campaignObjective: string | null = null;

  if (dbCampaign) {
    const statusMap: Record<string, string> = { ativo: 'ACTIVE', pausado: 'PAUSED', arquivado: 'ARCHIVED' };
    campaignBlock = {
      id: dbCampaign.metaCampaignId,
      name: dbCampaign.name,
      status: statusMap[dbCampaign.status] ?? dbCampaign.status.toUpperCase(),
    };
    const budgetObj = dbCampaign.budget as Record<string, unknown> | null | undefined;
    const wizardObjective = budgetObj && typeof budgetObj.objective === 'string' ? budgetObj.objective : null;
    campaignObjective = wizardObjective
      ? WIZARD_OBJECTIVE_MAP[wizardObjective as WizardObjective]?.metaObjective ?? wizardObjective
      : null;
  } else {
    try {
      const meta = await metaApiCall<{ name?: string; status?: string; objective?: string }>(
        `/${encodeURIComponent(args.campaignId)}?fields=name,status,objective`,
        accessToken
      );
      campaignBlock = {
        id: args.campaignId,
        name: meta.name || `Campaign ${args.campaignId}`,
        status: (meta.status || 'ACTIVE').toUpperCase(),
      };
      campaignObjective = meta.objective ?? null;
    } catch { /* keep defaults */ }
  }

  const { startDate, endDate } = calculateDateRange(args.dateRange, args.startDate, args.endDate);

  try {
    const response = await getMetaInsights({
      accessToken,
      entityId: args.campaignId,
      startDate,
      endDate,
      timeIncrement: 1,
    });

    const timeseries = (response.data || []).map((item) => {
      const spend = parseFloat(item.spend || '0');
      const impressions = parseInt(item.impressions || '0', 10);
      const clicks = parseInt(item.clicks || '0', 10);
      const ctr = parseFloat(item.ctr || '0');
      const cpc = parseFloat(item.cpc || '0');
      const cpm = parseFloat(item.cpm || '0');
      const conversions = parseConversionsFromActions(item.actions, campaignObjective, item.unique_actions) ?? 0;
      const roas = parseRoasFromPurchaseRoas(item.purchase_roas) ?? null;
      const cpa =
        (conversions > 0 ? roundToDecimals(spend / conversions, 2) : null) ??
        parseCpaFromCostPerAction(item.cost_per_action_type);

      return {
        date: item.date_start || item.date_stop || '',
        spend,
        impressions,
        clicks,
        ctr,
        cpc,
        cpm,
        roas,
        cpa,
        conversions,
      };
    });

    return { campaign: campaignBlock, timeseries };
  } catch (err) {
    console.error('[getCampaignInsights] Meta API error:', err);
    const metaCode = (err as any).metaCode;
    if (metaCode === 190) {
      throw new AppError(401, 'META_TOKEN_EXPIRED', 'Token Meta expirado. Reconecte sua conta em Configurações > Integrações');
    }
    throw err;
  }
}

function calculateDateRange(
  dateRange: 'last_7d' | 'last_30d' | 'last_90d' | 'custom',
  startDate?: string,
  endDate?: string
): { startDate: string; endDate: string } {
  const today = new Date();
  const end = new Date(today);
  const start = new Date(today);

  if (dateRange === 'last_7d') {
    start.setDate(start.getDate() - 7);
  } else if (dateRange === 'last_30d') {
    start.setDate(start.getDate() - 30);
  } else if (dateRange === 'last_90d') {
    start.setDate(start.getDate() - 90);
  } else if (dateRange === 'custom' && startDate && endDate) {
    return { startDate, endDate };
  }

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

// ==================== Campaign Creation Wizard ====================

export type WizardObjective = 'visits' | 'engagement' | 'messages' | 'whatsapp';

const WIZARD_OBJECTIVE_MAP: Record<
  WizardObjective,
  { metaObjective: string; optimizationGoal: string; cta: string; destinationType?: string; label: string }
> = {
  visits: { metaObjective: 'OUTCOME_TRAFFIC', optimizationGoal: 'LINK_CLICKS', cta: 'LEARN_MORE', label: 'Visitas' },
  engagement: {
    metaObjective: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'POST_ENGAGEMENT',
    cta: 'LIKE_PAGE',
    destinationType: 'ON_POST',
    label: 'Engajamento',
  },
  messages: {
    metaObjective: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'CONVERSATIONS',
    cta: 'MESSAGE_PAGE',
    destinationType: 'MESSENGER',
    label: 'Atração de Clientes',
  },
  whatsapp: {
    metaObjective: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'CONVERSATIONS',
    cta: 'WHATSAPP_MESSAGE',
    destinationType: 'WHATSAPP',
    label: 'Gerar Conversas',
  },
};

export type WizardMessagingDestination = 'whatsapp' | 'instagram_direct' | 'messenger';

/** Remove um objeto criado no Meta (Campaign/AdSet/AdCreative) durante rollback de falha. Best-effort: nao lanca. */
async function deleteMetaObject(objectId: string, accessToken: string): Promise<void> {
  try {
    await metaApiCall<unknown>(`/${objectId}`, accessToken, { method: 'DELETE' });
  } catch (cleanupErr) {
    console.error(`[CampaignWizard] Falha ao remover objeto Meta ${objectId} durante rollback:`, cleanupErr);
  }
}

function mapWizardMetaError(err: unknown, step: string): never {
  if (err instanceof AppError) throw err;

  const metaCode = (err as any).metaCode;
  const metaSubcode = (err as any).metaSubcode;
  const metaType = (err as any).metaType;
  const httpStatus = (err as any).httpStatus;
  const metaUserMsg = (err as any).metaUserMsg as string | undefined;
  const metaUserTitle = (err as any).metaUserTitle as string | undefined;
  const metaBlameField = (err as any).metaBlameField as string | undefined;
  const message = (err as Error).message || '';
  const lowerMessage = message.toLowerCase();

  console.error(`[CampaignWizard] Erro Meta API na etapa "${step}":`, {
    metaCode,
    metaSubcode,
    metaType,
    httpStatus,
    message,
    metaUserTitle,
    metaUserMsg,
    metaBlameField,
  });

  if (metaCode === 190) {
    throw new AppError(401, 'META_TOKEN_EXPIRED', 'Conexão com Meta expirada. Reconecte em Configurações');
  }

  if (metaType === 'OAuthException' && (metaCode === 200 || metaCode === 10)) {
    throw new AppError(
      403,
      'META_PERMISSION_DENIED',
      'Permissão do Meta ausente para publicar campanhas. Verifique ads_management, pages_show_list e business_management em Configurações → Integrações.'
    );
  }

  if (
    lowerMessage.includes('insufficient') ||
    lowerMessage.includes('saldo') ||
    lowerMessage.includes('fund')
  ) {
    throw new AppError(402, 'META_INSUFFICIENT_FUNDS', 'Conta de anúncios sem saldo suficiente');
  }

  // Subcode 3858258: Meta nao conseguiu baixar a imagem (robots.txt, formato invalido, etc.)
  if (metaSubcode === 3858258) {
    throw new AppError(400, 'META_IMAGE_DOWNLOAD_FAILED',
      'O Meta nao conseguiu baixar a imagem do criativo. A URL pode estar bloqueada (robots.txt) ou o formato pode ser invalido. Use uma imagem JPEG ou PNG hospedada em um servidor acessivel.',
      { step, meta_code: metaCode, meta_subcode: metaSubcode }
    );
  }

  // Subcode 1487110: Raio geografico fora dos limites (ex: SP precisa de 15km+)
  if (metaSubcode === 1487110) {
    throw new AppError(400, 'META_LOCATION_RADIUS',
      metaUserMsg || 'O raio geografico selecionado nao esta dentro dos limites. Aumente o raio (ex: Sao Paulo precisa de 15km ou mais).',
      { step, meta_code: metaCode, meta_subcode: metaSubcode }
    );
  }

  // Usa a mensagem amigavel da Meta se disponivel, senao a mensagem original
  const userMessage = metaUserMsg || metaUserTitle
    ? `${metaUserTitle ? metaUserTitle + ': ' : ''}${metaUserMsg || ''}`
    : (message || 'Erro ao publicar no Meta. Tente novamente.');

  throw new AppError(400, 'META_API_ERROR', userMessage, {
    step,
    meta_code: metaCode,
    meta_subcode: metaSubcode,
    ...(metaBlameField ? { blame_field: metaBlameField } : {}),
  });
}

export interface CreateWizardCampaignArgs {
  tenantId: string;
  objective: WizardObjective;
  creativeAssetId?: string;
  creativeUploadUrl?: string;
  creativeInstagramMediaId?: string;
  creativeMediaUrl?: string;
  headline: string;
  primaryText: string;
  destinationUrl?: string;
  locationCity: string;
  locationCityKey?: string;
  locationRadiusKm: number;
  ageMin: number;
  ageMax: number;
  gender: 'all' | 'male' | 'female';
  dailyBudgetBrl: number;
  durationDays?: number;
  whatsappPageId?: string;
  whatsappPageName?: string;
  whatsappPhoneNumberId?: string;
  whatsappPhoneNumber?: string;
  destinations?: WizardMessagingDestination[];
  instagramUserId?: string;
  instagramUsername?: string;
}

export interface CreateWizardCampaignResult {
  success: true;
  campaign_id: string;
  meta_campaign_id: string;
  campaign_name: string;
}

export async function createCampaignFromWizard(
  args: CreateWizardCampaignArgs
): Promise<CreateWizardCampaignResult> {
  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, args.tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found for this tenant');
  }

  const adAccountId = metaConn.selectedAdAccountId;
  if (!adAccountId) {
    throw new AppError(
      400,
      'AD_ACCOUNT_NOT_SELECTED',
      'Nenhuma conta de anúncios selecionada. Configure em Configurações → Integrações.'
    );
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);
  const objectiveConfig = WIZARD_OBJECTIVE_MAP[args.objective];

  let messagingDestinations: WizardMessagingDestination[] = [];

  if (args.objective === 'whatsapp') {
    if (!args.whatsappPageId) {
      throw new AppError(
        400,
        'WHATSAPP_PAGE_REQUIRED',
        'Selecione a Página do Facebook para receber as mensagens.'
      );
    }

    messagingDestinations = args.destinations && args.destinations.length > 0 ? args.destinations : ['whatsapp'];

    if (messagingDestinations.includes('whatsapp') && !args.whatsappPhoneNumber) {
      throw new AppError(
        400,
        'WHATSAPP_NUMBER_REQUIRED',
        'Selecione o número de WhatsApp que receberá as mensagens.'
      );
    }

    if (messagingDestinations.includes('instagram_direct') && !args.instagramUserId) {
      throw new AppError(
        400,
        'INSTAGRAM_USER_ID_REQUIRED',
        'Conecte uma conta do Instagram à Página no Meta Business para usar Instagram Direct.'
      );
    }
  }

  // Resolve image URL: Instagram post > direct upload > gallery asset
  let imageUrl = args.creativeInstagramMediaId ? args.creativeMediaUrl : args.creativeUploadUrl;
  if (!imageUrl && args.creativeAssetId) {
    const asset = await db.query.creativeAssets.findFirst({
      where: and(eq(creativeAssets.id, args.creativeAssetId), eq(creativeAssets.tenantId, args.tenantId)),
    });
    if (!asset) {
      throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo não encontrado.');
    }
    imageUrl = asset.url;
  }

  // ponytail: Instagram criativo nao precisa de imageUrl — usa source_instagram_media_id
  if (!imageUrl && !args.creativeInstagramMediaId) {
    throw new AppError(400, 'CREATIVE_IMAGE_MISSING', 'Selecione uma imagem da galeria ou envie um arquivo.');
  }

  // Para criativo a partir de post existente do Instagram, a Meta API exige
  // object_story_spec.instagram_actor_id + source_instagram_media_id (em vez de
  // link_data.picture), senao retorna code=100 "Invalid parameter".
  let instagramCreativeActorId: string | undefined;
  let instagramCreativePageId: string | undefined;
  if (args.creativeInstagramMediaId) {
    const assetSelection = await getResolvedTenantAssetSelection(args.tenantId);
    const igPage = assetSelection.pages.find((page) => page.instagramUserId);
    if (!igPage?.instagramUserId) {
      throw new AppError(
        400,
        'INSTAGRAM_ACCOUNT_NOT_FOUND',
        'Nenhuma conta do Instagram conectada para usar este post como criativo.'
      );
    }
    instagramCreativeActorId = igPage.instagramUserId;
    instagramCreativePageId = igPage.pageId;
  }

  // Resolve city key for geo targeting
  let cityKey = args.locationCityKey;
  if (!cityKey) {
    let locations: MetaLocationResult[];
    try {
      locations = await searchMetaCityLocations(args.locationCity, accessToken);
    } catch (err) {
      mapWizardMetaError(err, 'location_search');
    }
    const match = locations[0];
    if (!match) {
      throw new AppError(400, 'LOCATION_NOT_FOUND', 'Cidade não encontrada. Tente outro nome.');
    }
    cityKey = match.key;
  }

  const today = new Date();
  const dataLabel = today.toLocaleDateString('pt-BR');
  const campaignName = `${objectiveConfig.label} — FURY — ${dataLabel}`;

  // Resolve a Pagina do Facebook para promoted_object.page_id.
  // Prioridade: (1) pagina selecionada na conexao Meta, (2) env META_PAGE_ID.
  const selectedPageIds = (metaConn.selectedPageIds as string[] | null) ?? [];
  const pageId =
    args.objective === 'whatsapp'
      ? args.whatsappPageId!
      : selectedPageIds[0] || process.env.META_PAGE_ID || '';

  if (!pageId) {
    throw new AppError(
      400,
      'PAGE_NOT_FOUND',
      'Nenhuma Página do Facebook configurada. Selecione uma página em Configurações → Integrações.'
    );
  }

  let messagingDestinationType: string | undefined;
  let promotedObject: Record<string, unknown> | undefined;

  if (args.objective === 'whatsapp') {
    promotedObject = { page_id: args.whatsappPageId };

    if (messagingDestinations.includes('whatsapp')) {
      promotedObject.whatsapp_phone_number = args.whatsappPhoneNumber;
    }
    if (messagingDestinations.includes('instagram_direct')) {
      promotedObject.instagram_user_id = args.instagramUserId;
    }

    messagingDestinationType =
      messagingDestinations.length > 1
        ? 'MESSAGING_APPS'
        : messagingDestinations[0] === 'whatsapp'
          ? 'WHATSAPP'
          : messagingDestinations[0] === 'instagram_direct'
            ? 'INSTAGRAM_DIRECT'
            : 'MESSENGER';
  } else if (args.objective === 'visits' || args.objective === 'engagement' || args.objective === 'messages') {
    // OUTCOME_TRAFFIC (visits), OUTCOME_ENGAGEMENT (engagement) e OUTCOME_LEADS (messages)
    // exigem promoted_object.page_id no AdSet.
    promotedObject = { page_id: pageId };
  }

  const destinationType = messagingDestinationType || objectiveConfig.destinationType;

  let metaCampaignId: string | undefined;
  let adSetId: string | undefined;
  let adCreativeId: string | undefined;
  let metaAdId: string | undefined;

  try {
    const campaignBody = {
      name: campaignName,
      objective: objectiveConfig.metaObjective,
      status: 'ACTIVE',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    };

    console.log('[DEBUG] campaignBody: ' + JSON.stringify(campaignBody));
    console.log('[DEBUG] adAccountId: ' + adAccountId);
    console.log('[DEBUG] objective recebido: ' + args.objective);

    // Inicia download+upload da imagem em paralelo com a criacao da campanha e adset.
    // Isso economiza 1-2s no fluxo total, ajudando a ficar dentro do timeout do proxy.
    let adImageHashPromise: Promise<string | undefined> = Promise.resolve(undefined);
    if (!instagramCreativeActorId && imageUrl) {
      adImageHashPromise = (async () => {
        try {
          const imageResponse = await fetch(imageUrl, {
            signal: AbortSignal.timeout(15_000),
            headers: { 'User-Agent': 'FURY/1.0' },
          });
          if (!imageResponse.ok) {
            throw new Error(`Falha ao baixar imagem (HTTP ${imageResponse.status}). Verifique se a URL está acessível.`);
          }

          const contentType = imageResponse.headers.get('content-type') || '';
          // Meta so aceita JPEG e PNG para adimages; SVG e outros formatos sao rejeitados.
          if (!contentType.includes('jpeg') && !contentType.includes('png') && !contentType.includes('image/')) {
            throw new Error(
              `Formato de imagem nao suportado: ${contentType || 'desconhecido'}. ` +
              'Use uma imagem JPEG ou PNG acessivel publicamente.'
            );
          }

          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          const base64 = imageBuffer.toString('base64');
          const ext = contentType.includes('png') ? 'png' : 'jpg';
          const filename = `fury_creative_${Date.now()}.${ext}`;
          const hash = await uploadAdImage({ adAccountId, base64, filename, accessToken });
          console.log('[CampaignWizard] Imagem enviada para Meta, hash:', hash);
          return hash;
        } catch (uploadErr) {
          console.error('[CampaignWizard] Falha ao enviar imagem para Meta, usando URL original:', uploadErr);
          // Se o upload falhar, usa a URL original como fallback.
          // NOTA: Meta pode nao conseguir baixar a URL original se o servidor tiver robots.txt ou bloqueio.
          return undefined;
        }
      })();
    }

    const campaignResponse = await metaApiCall<MetaCampaignCreateResponse>(
      `/${encodeURIComponent(adAccountId)}/campaigns`,
      accessToken,
      {
        method: 'POST',
        body: campaignBody,
      }
    );
    metaCampaignId = campaignResponse.id;

    const targeting: Record<string, unknown> = {
      geo_locations: {
        cities: [{ key: parseInt(cityKey, 10), radius: args.locationRadiusKm, distance_unit: 'kilometer' }],
      },
      age_min: args.ageMin,
      age_max: args.ageMax,
      genders: args.gender === 'all' ? [1, 2] : args.gender === 'male' ? [1] : [2],
      // Meta exige targeting_automation.advantage_audience DENTRO do targeting (erro 1870227).
      // 0 = desabilita Advantage+ audience (targeting manual).
      targeting_automation: { advantage_audience: 0 },
    };

    const adSetBody: Record<string, unknown> = {
      name: `AdSet — ${args.locationCity} — FURY`,
      campaign_id: metaCampaignId,
      daily_budget: Math.round(args.dailyBudgetBrl * 100),
      billing_event: 'IMPRESSIONS',
      optimization_goal: objectiveConfig.optimizationGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP', // obrigatorio pela Meta API (erro 2490487)
      targeting,
      status: 'ACTIVE',
    };

    if (destinationType) {
      adSetBody.destination_type = destinationType;
    }

    if (promotedObject) {
      adSetBody.promoted_object = promotedObject;
    }

    if (args.durationDays) {
      const endTime = new Date(today.getTime() + args.durationDays * 24 * 60 * 60 * 1000);
      adSetBody.end_time = endTime.toISOString();
    }

    const adSetResponse = await metaApiCall<{ id: string }>(
      `/${encodeURIComponent(adAccountId)}/adsets`,
      accessToken,
      { method: 'POST', body: adSetBody }
    );
    adSetId = adSetResponse.id;

    // Aguarda o upload da imagem (que estava rodando em paralelo)
    const adImageHash = await adImageHashPromise;

    const creativeBody: Record<string, unknown> = instagramCreativeActorId
      ? {
          name: 'Creative — FURY',
          object_story_spec: {
            page_id: instagramCreativePageId,
            instagram_user_id: instagramCreativeActorId,
          },
          source_instagram_media_id: args.creativeInstagramMediaId,
          // ponytail: link na raiz — Meta rejeita link_data.link + source_instagram_media_id juntos (subcode 1487929)
          link: args.destinationUrl
            || (args.objective === 'engagement' ? `https://www.facebook.com/${instagramCreativePageId}` : `https://www.instagram.com/`),
        }
      : {
          name: 'Creative — FURY',
          object_story_spec: {
            page_id: pageId,
            link_data: {
              picture: adImageHash || imageUrl,
              message: args.primaryText,
              name: args.headline,
              call_to_action: messagingDestinationType
                ? {
                    type: messagingDestinations.includes('whatsapp') ? 'WHATSAPP_MESSAGE' : 'MESSAGE_PAGE',
                    value: { app_destination: messagingDestinationType },
                  }
                : { type: objectiveConfig.cta },
              ...(args.objective === 'visits' ? { link: args.destinationUrl } : {}),
              ...(args.objective === 'engagement' ? { link: `https://www.facebook.com/${pageId}` } : {}),
              ...(!messagingDestinations.includes('whatsapp') && messagingDestinationType === 'MESSENGER' ? { link: `https://www.facebook.com/${pageId}` } : {}),
              ...(messagingDestinations.includes('whatsapp') ? { link: 'https://api.whatsapp.com/send' } : {}),
            },
          },
        };

    console.log('[CampaignWizard] AdCreative body:', JSON.stringify(creativeBody));

    const adCreativeResponse = await metaApiCall<{ id: string }>(
      `/${encodeURIComponent(adAccountId)}/adcreatives`,
      accessToken,
      {
        method: 'POST',
        body: creativeBody,
      }
    );
    adCreativeId = adCreativeResponse.id;

    const adResponse = await metaApiCall<{ id: string }>(
      `/${encodeURIComponent(adAccountId)}/ads`,
      accessToken,
      {
        method: 'POST',
        body: {
          name: `Ad — FURY — ${dataLabel}`,
          adset_id: adSetId,
          creative: { creative_id: adCreativeId },
          status: 'ACTIVE',
        },
      }
    );
    metaAdId = adResponse.id;
  } catch (err) {
    // NOTA: Rollback com deleteMetaObject foi removido pois causava crash (502)
    // em produção. Os objetos orfaos no Meta (campaign/adset/creative) serao
    // limpos manualmente ou por um job futuro.
    const step = !metaCampaignId ? 'campaign' : !adSetId ? 'adset' : !adCreativeId ? 'creative' : 'ad';
    mapWizardMetaError(err, step);
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({
      tenantId: args.tenantId,
      metaCampaignId,
      name: campaignName,
      status: 'active',
      budget: {
        daily_budget: Math.round(args.dailyBudgetBrl * 100),
        objective: objectiveConfig.metaObjective,
        created_via: 'wizard',
        ad_set_id: adSetId,
        ad_creative_id: adCreativeId,
        ad_id: metaAdId,
        duration_days: args.durationDays ?? null,
        ...(args.objective === 'whatsapp'
          ? {
              destinations: messagingDestinations,
              destination_type: messagingDestinationType,
              whatsapp_page_id: args.whatsappPageId,
              whatsapp_page_name: args.whatsappPageName ?? null,
              whatsapp_phone_number_id: messagingDestinations.includes('whatsapp')
                ? args.whatsappPhoneNumberId ?? null
                : null,
              whatsapp_phone_number: messagingDestinations.includes('whatsapp')
                ? args.whatsappPhoneNumber ?? null
                : null,
              instagram_user_id: messagingDestinations.includes('instagram_direct')
                ? args.instagramUserId ?? null
                : null,
              instagram_username: messagingDestinations.includes('instagram_direct')
                ? args.instagramUsername ?? null
                : null,
            }
          : {}),
      },
    })
    .returning();

  await invalidateCampaignsCache(args.tenantId);

  return {
    success: true,
    campaign_id: campaign.id,
    meta_campaign_id: metaCampaignId,
    campaign_name: campaignName,
  };
}

export async function searchMetaLocations(args: { tenantId: string; query: string }): Promise<MetaLocationResult[]> {
  const cached = await getMetaLocationsCache(args.query);
  if (cached) return cached;

  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, args.tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found for this tenant');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

  let results: MetaLocationResult[];
  try {
    results = await searchMetaCityLocations(args.query, accessToken);
  } catch (err) {
    mapWizardMetaError(err, 'location_search');
  }

  await setMetaLocationsCache(args.query, results);

  return results;
}
