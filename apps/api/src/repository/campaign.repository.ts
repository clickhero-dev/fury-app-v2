import {
  db as defaultDb,
  type Database,
  campaigns,
  furyInsights,
  metaConnections,
  creativeAssets,
  automationRules,
} from '@fury/db';
import { and, desc, eq } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type Campaign = typeof campaigns.$inferSelect;
type FuryInsight = typeof furyInsights.$inferSelect;

/**
 * Repositório do domínio **Campanhas / Meta Ads**.
 * Agregado: `campaigns` (+ `furyInsights` e `automationRules` no escopo da
 * campanha). ADR-0001.
 *
 * Substitui o antigo `DefaultCampaignRepository`/`ICampaignRepository` por um
 * repositório tenant-bound, consistente com as demais ondas.
 */
export class CampaignRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  async findCampaignById(id: string) {
    return this.db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, id), eq(campaigns.tenantId, this.tenantId)),
    });
  }

  async findCampaignByTenantAndId(campaignId: string) {
    return this.db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, this.tenantId)),
    });
  }

  async findCampaignByMetaId(metaCampaignId: string) {
    return this.db.query.campaigns.findFirst({
      where: and(eq(campaigns.metaCampaignId, metaCampaignId), eq(campaigns.tenantId, this.tenantId)),
    });
  }

  async findCampaigns(status?: string, limit = 50, offset = 0): Promise<{ items: Campaign[]; total: number }> {
    const filters = [eq(campaigns.tenantId, this.tenantId)];
    if (status) filters.push(eq(campaigns.status, status as any));

    const items = await this.db.query.campaigns.findMany({
      where: and(...filters),
      limit,
      offset,
      orderBy: [desc(campaigns.createdAt)],
    });
    const all = await this.db.query.campaigns.findMany({ where: and(...filters) });
    return { items, total: all.length };
  }

  async createCampaign(data: Partial<Campaign>): Promise<Campaign> {
    const [row] = await this.db.insert(campaigns).values({ ...data, tenantId: this.tenantId } as any).returning();
    return row;
  }

  async updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign> {
    const [row] = await this.db.update(campaigns).set(data as any).where(and(eq(campaigns.id, id), eq(campaigns.tenantId, this.tenantId))).returning();
    return row as Campaign;
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.tenantId, this.tenantId)));
  }

  async findCreativeAsset(id: string) {
    return this.db.query.creativeAssets.findFirst({
      where: and(eq(creativeAssets.id, id), eq(creativeAssets.tenantId, this.tenantId)),
    });
  }

  async findRecentTakedowns(campaignId: string, limit = 5): Promise<FuryInsight[]> {
    const rows = await this.db.query.furyInsights.findMany({
      where: and(
        eq(furyInsights.tenantId, this.tenantId),
        eq(furyInsights.campaignId, campaignId),
        eq(furyInsights.suggestionType, 'smart_takedown'),
      ),
      orderBy: [desc(furyInsights.createdAt)],
      limit,
    });
    return rows as FuryInsight[];
  }

  async findActiveAutomationRules() {
    return this.db.query.automationRules.findMany({
      where: and(eq(automationRules.tenantId, this.tenantId), eq(automationRules.isActive, true)),
      orderBy: [desc(automationRules.updatedAt)],
    });
  }

  async insertFuryInsight(data: Partial<FuryInsight>): Promise<void> {
    await this.db.insert(furyInsights).values({ ...data, tenantId: this.tenantId } as any);
  }
}