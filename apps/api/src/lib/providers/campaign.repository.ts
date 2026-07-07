import type { CampaignListItem } from '../../services/campaigns.service.js';

export interface CampaignRecord {
  id: string;
  tenantId: string;
  metaCampaignId: string;
  name: string;
  status: string;
  budget: unknown;
  metrics: unknown;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FuryInsightRecord {
  id: string;
  tenantId: string;
  campaignId: string;
  suggestionType: string;
  suggestionData: unknown;
  appliedAt: Date | null;
  createdAt: Date;
}

export interface AutomationRuleRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  trigger: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  ruleType: string;
  threshold: number;
  action: string;
}

export interface MetaConnectionRecord {
  id: string;
  tenantId: string;
  selectedAdAccountId: string | null;
  adAccounts: unknown;
  accessToken: string;
  selectedPageIds: string[] | null;
  createdAt: Date;
}

export interface CreativeAssetRecord {
  id: string;
  tenantId: string;
  url: string;
  createdAt: Date;
}

export interface ICampaignRepository {
  findMetaConnection(tenantId: string): Promise<MetaConnectionRecord | null>;

  findCampaignById(id: string): Promise<CampaignRecord | null>;

  findCampaignByTenantAndId(tenantId: string, campaignId: string): Promise<CampaignRecord | null>;

  findCampaignByMetaId(tenantId: string, metaCampaignId: string): Promise<CampaignRecord | null>;

  findCampaigns(
    tenantId: string,
    status?: string,
    limit?: number,
    offset?: number
  ): Promise<{ items: CampaignRecord[]; total: number }>;

  createCampaign(data: Partial<CampaignRecord>): Promise<CampaignRecord>;

  updateCampaign(id: string, data: Partial<CampaignRecord>): Promise<CampaignRecord>;

  findCreativeAsset(id: string, tenantId: string): Promise<CreativeAssetRecord | null>;

  findRecentTakedowns(tenantId: string, campaignId: string, limit?: number): Promise<FuryInsightRecord[]>;

  findActiveAutomationRules(tenantId: string): Promise<AutomationRuleRecord[]>;

  insertFuryInsight(data: Partial<FuryInsightRecord>): Promise<void>;
}
