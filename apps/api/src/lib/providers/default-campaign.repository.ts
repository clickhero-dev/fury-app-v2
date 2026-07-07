import { and, desc, eq } from 'drizzle-orm';
import {
  automationRules,
  campaigns,
  creativeAssets,
  db,
  furyInsights,
  metaConnections,
} from '../../lib/db.js';
import type {
  ICampaignRepository,
  CampaignRecord,
  MetaConnectionRecord,
  CreativeAssetRecord,
  FuryInsightRecord,
  AutomationRuleRecord,
} from './campaign.repository.js';

export class DefaultCampaignRepository implements ICampaignRepository {
  async findMetaConnection(tenantId: string): Promise<MetaConnectionRecord | null> {
    const row = await db.query.metaConnections.findFirst({
      where: eq(metaConnections.tenantId, tenantId),
      orderBy: [desc(metaConnections.createdAt)],
    });
    return row as MetaConnectionRecord | null;
  }

  async findCampaignById(id: string): Promise<CampaignRecord | null> {
    const row = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, id),
    });
    return row as CampaignRecord | null;
  }

  async findCampaignByTenantAndId(tenantId: string, campaignId: string): Promise<CampaignRecord | null> {
    const row = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)),
    });
    return row as CampaignRecord | null;
  }

  async findCampaignByMetaId(tenantId: string, metaCampaignId: string): Promise<CampaignRecord | null> {
    const row = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.metaCampaignId, metaCampaignId), eq(campaigns.tenantId, tenantId)),
    });
    return row as CampaignRecord | null;
  }

  async findCampaigns(
    tenantId: string,
    status?: string,
    limit = 50,
    offset = 0
  ): Promise<{ items: CampaignRecord[]; total: number }> {
    const filters = [eq(campaigns.tenantId, tenantId)];
    if (status) {
      filters.push(eq(campaigns.status, status as any));
    }

    const items = await db.query.campaigns.findMany({
      where: and(...filters),
      limit,
      offset,
      orderBy: [desc(campaigns.createdAt)],
    });

    const all = await db.query.campaigns.findMany({
      where: and(...filters),
    });

    return {
      items: items as CampaignRecord[],
      total: all.length,
    };
  }

  async createCampaign(data: Partial<CampaignRecord>): Promise<CampaignRecord> {
    const [row] = await db.insert(campaigns).values(data as any).returning();
    return row as CampaignRecord;
  }

  async updateCampaign(id: string, data: Partial<CampaignRecord>): Promise<CampaignRecord> {
    const [row] = await db.update(campaigns).set(data as any).where(eq(campaigns.id, id)).returning();
    return row as CampaignRecord;
  }

  async findCreativeAsset(id: string, tenantId: string): Promise<CreativeAssetRecord | null> {
    const row = await db.query.creativeAssets.findFirst({
      where: and(eq(creativeAssets.id, id), eq(creativeAssets.tenantId, tenantId)),
    });
    return row as CreativeAssetRecord | null;
  }

  async findRecentTakedowns(
    tenantId: string,
    campaignId: string,
    limit = 5
  ): Promise<FuryInsightRecord[]> {
    const rows = await db.query.furyInsights.findMany({
      where: and(
        eq(furyInsights.tenantId, tenantId),
        eq(furyInsights.campaignId, campaignId),
        eq(furyInsights.suggestionType, 'smart_takedown'),
      ),
      orderBy: [desc(furyInsights.createdAt)],
      limit,
    });
    return rows as FuryInsightRecord[];
  }

  async findActiveAutomationRules(tenantId: string): Promise<AutomationRuleRecord[]> {
    const rows = await db.query.automationRules.findMany({
      where: and(eq(automationRules.tenantId, tenantId), eq(automationRules.isActive, true)),
      orderBy: [desc(automationRules.updatedAt)],
    });
    return rows as unknown as AutomationRuleRecord[];
  }

  async insertFuryInsight(data: Partial<FuryInsightRecord>): Promise<void> {
    await db.insert(furyInsights).values(data as any);
  }
}
