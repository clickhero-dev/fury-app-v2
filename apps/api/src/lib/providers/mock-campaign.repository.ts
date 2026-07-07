import type { ICampaignRepository, CampaignRecord, MetaConnectionRecord, CreativeAssetRecord, FuryInsightRecord, AutomationRuleRecord } from './campaign.repository.js';

export class MockCampaignRepository implements ICampaignRepository {
  metaConnections: MetaConnectionRecord[] = [];
  campaigns: CampaignRecord[] = [];
  creativeAssets: CreativeAssetRecord[] = [];
  furyInsights: FuryInsightRecord[] = [];
  automationRules: AutomationRuleRecord[] = [];

  async findMetaConnection(tenantId: string): Promise<MetaConnectionRecord | null> {
    return this.metaConnections.find((c) => c.tenantId === tenantId) ?? null;
  }

  async findCampaignById(id: string): Promise<CampaignRecord | null> {
    return this.campaigns.find((c) => c.id === id) ?? null;
  }

  async findCampaignByTenantAndId(tenantId: string, campaignId: string): Promise<CampaignRecord | null> {
    return this.campaigns.find((c) => c.id === campaignId && c.tenantId === tenantId) ?? null;
  }

  async findCampaignByMetaId(tenantId: string, metaCampaignId: string): Promise<CampaignRecord | null> {
    return this.campaigns.find((c) => c.metaCampaignId === metaCampaignId && c.tenantId === tenantId) ?? null;
  }

  async findCampaigns(tenantId: string, status?: string, limit = 50, offset = 0): Promise<{ items: CampaignRecord[]; total: number }> {
    let items = this.campaigns.filter((c) => c.tenantId === tenantId);
    if (status) items = items.filter((c) => c.status === status);
    return { items: items.slice(offset, offset + limit), total: items.length };
  }

  async createCampaign(data: any): Promise<CampaignRecord> {
    const id = `campaign_${this.campaigns.length + 1}`;
    const campaign = { ...data, id, createdAt: new Date(), updatedAt: new Date() } as CampaignRecord;
    this.campaigns.push(campaign);
    return campaign;
  }

  async updateCampaign(id: string, data: any): Promise<CampaignRecord> {
    const idx = this.campaigns.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Campaign ${id} not found`);
    this.campaigns[idx] = { ...this.campaigns[idx], ...data, updatedAt: new Date() };
    return this.campaigns[idx];
  }

  async findCreativeAsset(id: string, tenantId: string): Promise<CreativeAssetRecord | null> {
    return this.creativeAssets.find((a) => a.id === id && a.tenantId === tenantId) ?? null;
  }

  async findRecentTakedowns(tenantId: string, campaignId: string, limit = 5): Promise<FuryInsightRecord[]> {
    return this.furyInsights
      .filter((i) => i.tenantId === tenantId && i.campaignId === campaignId && i.suggestionType === 'smart_takedown')
      .slice(0, limit);
  }

  async findActiveAutomationRules(tenantId: string): Promise<AutomationRuleRecord[]> {
    return this.automationRules.filter((r) => r.tenantId === tenantId && r.isActive);
  }

  async insertFuryInsight(data: any): Promise<void> {
    this.furyInsights.push({ ...data, id: `insight_${this.furyInsights.length + 1}`, createdAt: new Date() } as FuryInsightRecord);
  }
}
