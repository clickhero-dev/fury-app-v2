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
import { getCampaignAds, searchMetaInterests as searchMetaInterestsLib } from '../lib/meta-api.js';
import type { IMetaCampaignProvider } from '../lib/providers/meta-campaign.provider.js';
import type {
  ICampaignRepository,
  CampaignRecord,
} from '../lib/providers/campaign.repository.js';
import { DefaultMetaCampaignProvider } from '../lib/providers/default-meta-campaign.provider.js';
import { DefaultCampaignRepository } from '../lib/providers/default-campaign.repository.js';

// ── Shared types ────────────────────────────────────────────────────────────

export interface CampaignPanelMetrics {
  spend: number; roas: number; cpa: number; ctr: number; cpm: number;
  conversions: number; impressions: number;
}

export interface TakedownItem {
  id: string; campaignId: string; suggestionType: string;
  suggestionData: Record<string, unknown>; appliedAt: string | null; createdAt: string;
}

export interface AutomationRuleItem {
  id: string; tenantId: string; name: string; description: string | null;
  trigger: string; enabled: boolean; createdAt: string; updatedAt: string;
  ruleType: string; isActive: boolean; threshold: number; action: string;
}

export interface CampaignListItem {
  id: string; name: string; status: string; objective: string | null;
  budget: unknown; spend: number; impressions: number; clicks: number;
  ctr: number; cpc: number; roas: number; cpa: number; conversions: number;
}

export type WizardObjective = 'visits' | 'whatsapp_conv' | 'engagement' | 'messages' | 'whatsapp';
export type WizardMessagingDestination = 'whatsapp' | 'instagram_direct' | 'messenger';

export interface CreateWizardCampaignArgs {
  tenantId: string; objective: WizardObjective; creativeAssetId?: string;
  creativeUploadUrl?: string; creativeInstagramMediaId?: string;
  creativeMediaUrl?: string; headline: string; primaryText: string;
  destinationUrl?: string; locationCity: string; locationCityKey?: string;
  locationRadiusKm: number; ageMin: number; ageMax: number;
  gender: 'all' | 'male' | 'female'; dailyBudgetBrl: number; durationDays?: number;
  whatsappPageId?: string; whatsappPageName?: string;
  whatsappPhoneNumberId?: string; whatsappPhoneNumber?: string;
  destinations?: WizardMessagingDestination[]; instagramUserId?: string;
  instagramUsername?: string;
  audienceInterests?: { id: string; name: string }[];
}

export interface CreateWizardCampaignResult {
  success: true; campaign_id: string; meta_campaign_id: string; campaign_name: string;
}

// ── Wizard constants ────────────────────────────────────────────────────────

const WIZARD_OBJECTIVE_MAP: Record<WizardObjective, {
  metaObjective: string; optimizationGoal: string; cta: string;
  destinationType?: string; label: string;
}> = {
  visits: { metaObjective: 'OUTCOME_TRAFFIC', optimizationGoal: 'LINK_CLICKS', cta: 'LEARN_MORE', label: 'Visitas' },
  whatsapp_conv: { metaObjective: 'OUTCOME_TRAFFIC', optimizationGoal: 'LINK_CLICKS', cta: 'LEARN_MORE', label: 'Conversas WhatsApp' },
  engagement: { metaObjective: 'OUTCOME_ENGAGEMENT', optimizationGoal: 'POST_ENGAGEMENT', cta: 'LIKE_PAGE', destinationType: 'ON_POST', label: 'Engajamento' },
  messages: { metaObjective: 'OUTCOME_ENGAGEMENT', optimizationGoal: 'CONVERSATIONS', cta: 'MESSAGE_PAGE', destinationType: 'MESSENGER', label: 'Atração de Clientes' },
  whatsapp: { metaObjective: 'OUTCOME_ENGAGEMENT', optimizationGoal: 'CONVERSATIONS', cta: 'WHATSAPP_MESSAGE', destinationType: 'WHATSAPP', label: 'Gerar Conversas' },
};

// ── Pure helper functions (exported for testing) ────────────────────────────

export function normalizeCampaignPanelMetrics(raw: unknown): CampaignPanelMetrics {
  const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
    return Number.isFinite(n) ? n : 0;
  };
  return {
    spend: num(m.spend), roas: num(m.roas), cpa: num(m.cpa), ctr: num(m.ctr),
    cpm: num(m.cpm), conversions: num(m.conversions), impressions: num(m.impressions),
  };
}

export function formatCampaignListItem(campaign: CampaignRecord): CampaignListItem {
  const budgetObj = campaign.budget as Record<string, unknown> | null | undefined;
  const metricsObj = campaign.metrics as Record<string, unknown> | null | undefined;
  const objective = budgetObj && typeof budgetObj.objective === 'string' ? budgetObj.objective : null;
  const getMetric = (key: string): number => {
    if (!metricsObj) return 0;
    const val = metricsObj[key];
    if (typeof val === 'number') return val;
    if (typeof val === 'string') { const n = parseFloat(val); return Number.isFinite(n) ? n : 0; }
    return 0;
  };
  return {
    id: campaign.id, name: campaign.name, status: campaign.status, objective,
    budget: campaign.budget ?? {}, spend: getMetric('spend'), impressions: getMetric('impressions'),
    clicks: getMetric('clicks'), ctr: getMetric('ctr'), cpc: getMetric('cpc'),
    roas: getMetric('roas'), cpa: getMetric('cpa'), conversions: getMetric('conversions'),
  };
}

export function calculateDateRange(
  dateRange: 'last_7d' | 'last_30d' | 'last_90d' | 'custom',
  startDate?: string, endDate?: string
): { startDate: string; endDate: string } {
  if (dateRange === 'custom' && startDate && endDate) return { startDate, endDate };
  const today = new Date();
  const end = new Date(today);
  const start = new Date(today);
  const days = dateRange === 'last_7d' ? 7 : dateRange === 'last_30d' ? 30 : 90;
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export function mapWizardMetaError(err: unknown, step: string): never {
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
    metaCode, metaSubcode, metaType, httpStatus, message, metaUserTitle, metaUserMsg, metaBlameField,
  });

  if (metaCode === 190) {
    throw new AppError(401, 'META_TOKEN_EXPIRED', 'Conexão com Meta expirada. Reconecte em Configurações');
  }
  if (metaType === 'OAuthException' && (metaCode === 200 || metaCode === 10)) {
    throw new AppError(403, 'META_PERMISSION_DENIED', 'Permissão do Meta ausente para publicar campanhas. Verifique ads_management, pages_show_list e business_management em Configurações → Integrações.');
  }
  if (lowerMessage.includes('insufficient') || lowerMessage.includes('saldo') || lowerMessage.includes('fund')) {
    throw new AppError(402, 'META_INSUFFICIENT_FUNDS', 'Conta de anúncios sem saldo suficiente');
  }
  if (metaSubcode === 3858258) {
    throw new AppError(400, 'META_IMAGE_DOWNLOAD_FAILED', 'O Meta nao conseguiu baixar a imagem do criativo. A URL pode estar bloqueada (robots.txt) ou o formato pode ser invalido. Use uma imagem JPEG ou PNG hospedada em um servidor acessivel.', { step, meta_code: metaCode, meta_subcode: metaSubcode });
  }
  if (metaSubcode === 1487110) {
    throw new AppError(400, 'META_LOCATION_RADIUS', metaUserMsg || 'O raio geografico selecionado nao esta dentro dos limites. Aumente o raio (ex: Sao Paulo precisa de 15km ou mais).', { step, meta_code: metaCode, meta_subcode: metaSubcode });
  }
  const userMessage = metaUserMsg || metaUserTitle ? `${metaUserTitle ? metaUserTitle + ': ' : ''}${metaUserMsg || ''}` : (message || 'Erro ao publicar no Meta. Tente novamente.');
  throw new AppError(400, 'META_API_ERROR', userMessage, { step, meta_code: metaCode, meta_subcode: metaSubcode, ...(metaBlameField ? { blame_field: metaBlameField } : {}) });
}

// ── Service class ────────────────────────────────────────────────────────────

export class CampaignsService {
  constructor(
    private meta: IMetaCampaignProvider,
    private repo: ICampaignRepository,
    private deps: {
      decryptMetaToken: (token: string) => string;
      invalidateCampaignsCache: (tenantId: string) => Promise<void>;
      getMetaLocationsCache: (query: string) => Promise<any>;
      setMetaLocationsCache: (query: string, data: any) => Promise<void>;
      getResolvedTenantAssetSelection: (tenantId: string) => Promise<{ pages: Array<{ instagramUserId?: string; pageId?: string }> }>;
    }
  ) {}

  private handleMetaError(err: unknown): never {
    const metaCode = (err as any).metaCode;
    const metaSubcode = (err as any).metaSubcode;
    if (metaCode === 190) {
      throw new AppError(401, 'META_TOKEN_EXPIRED', 'Token Meta expirado. Reconecte sua conta em Configurações > Integrações');
    }
    if (metaCode === 100 && metaSubcode === 1487566) {
      throw new AppError(400, 'CAMPAIGN_DELETED', 'Esta campanha foi excluída no Meta e não pode ser pausada. Se quiser reativar, duplique a campanha.');
    }
    if (metaCode === 100) {
      throw new AppError(400, 'INVALID_PARAMETER', (err as Error).message);
    }
    throw err;
  }

  async createCampaign(args: {
    tenantId: string; name: string;
    objective: 'OUTCOME_SALES' | 'OUTCOME_LEADS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_AWARENESS';
    dailyBudget: number; adAccountId: string;
  }) {
    const metaConn = await this.repo.findMetaConnection(args.tenantId);
    if (!metaConn) throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found for this tenant');

    const adAccounts = (metaConn.adAccounts as { id: string }[]) || [];
    if (!adAccounts.some((acc) => acc.id === args.adAccountId)) {
      throw new AppError(403, 'AD_ACCOUNT_NOT_FOUND', 'Ad account does not belong to this tenant');
    }

    const accessToken = this.deps.decryptMetaToken(metaConn.accessToken);

    try {
      const response = await this.meta.createCampaign(args.adAccountId, accessToken, {
        name: args.name, objective: args.objective, status: 'PAUSED',
        special_ad_categories: [], is_adset_budget_sharing_enabled: false,
      });

      return this.repo.createCampaign({
        tenantId: args.tenantId,
        metaCampaignId: response.id,
        name: args.name,
        status: 'paused',
        budget: { daily_budget: args.dailyBudget, objective: args.objective },
      } as any);
    } catch (err) { this.handleMetaError(err); }
  }

  private async verifyCampaignOwnership(campaign: CampaignRecord, tenantId: string): Promise<void> {
    if (campaign.tenantId !== tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
    }
  }

  private async getAccessToken(tenantId: string): Promise<string> {
    const metaConn = await this.repo.findMetaConnection(tenantId);
    if (!metaConn) throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found');
    return this.deps.decryptMetaToken(metaConn.accessToken);
  }

  private async findCampaignOrThrow(tenantId: string, campaignId: string): Promise<CampaignRecord> {
    const campaign = await this.repo.findCampaignById(campaignId);
    if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
    await this.verifyCampaignOwnership(campaign, tenantId);
    return campaign;
  }

  private async checkDeletedOnMeta(campaignMeta: Record<string, unknown>, campaignId: string): Promise<boolean> {
    const metaStatus = campaignMeta.status as string | undefined;
    if (metaStatus === 'DELETED' || metaStatus === 'ARCHIVED') {
      await this.repo.updateCampaign(campaignId, { status: 'archived' });
      return true;
    }
    return false;
  }

  async pauseCampaign(args: { tenantId: string; campaignId: string }) {
    const accessToken = await this.getAccessToken(args.tenantId);

    const campaignMeta = await this.meta.getCampaign(args.campaignId, accessToken, 'account_id,status');
    if (await this.checkDeletedOnMeta(campaignMeta, args.campaignId)) {
      throw new AppError(400, 'CAMPAIGN_DELETED', 'Esta campanha foi excluída no Meta e não pode ser pausada.');
    }
    if (campaignMeta.account_id) {
      const metaConn = await this.repo.findMetaConnection(args.tenantId);
      const normalize = (id: string) => id.replace(/^act_/, '');
      const adAccounts = (metaConn?.adAccounts as { id: string }[]) || [];
      if (!adAccounts.some((acc) => normalize(acc.id) === normalize(campaignMeta.account_id as string))) {
        throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
      }
    }

    try { await this.meta.updateCampaign(args.campaignId, accessToken, { status: 'PAUSED' }); }
    catch (err) { this.handleMetaError(err); }
    return { campaignId: args.campaignId, status: 'PAUSED' as const };
  }

  async resumeCampaign(args: { tenantId: string; campaignId: string }) {
    const accessToken = await this.getAccessToken(args.tenantId);

    const campaignMeta = await this.meta.getCampaign(args.campaignId, accessToken, 'account_id,status');
    if (await this.checkDeletedOnMeta(campaignMeta, args.campaignId)) {
      throw new AppError(400, 'CAMPAIGN_DELETED', 'Esta campanha foi excluída no Meta e não pode ser reativada.');
    }
    if (campaignMeta.account_id) {
      const metaConn = await this.repo.findMetaConnection(args.tenantId);
      const normalize = (id: string) => id.replace(/^act_/, '');
      const adAccounts = (metaConn?.adAccounts as { id: string }[]) || [];
      if (!adAccounts.some((acc) => normalize(acc.id) === normalize(campaignMeta.account_id as string))) {
        throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
      }
    }

    try { await this.meta.updateCampaign(args.campaignId, accessToken, { status: 'ACTIVE' }); }
    catch (err) { this.handleMetaError(err); }
    return { campaignId: args.campaignId, status: 'ACTIVE' as const };
  }

  async updateCampaignBudget(args: { tenantId: string; campaignId: string; dailyBudget: number }) {
    const campaign = await this.findCampaignOrThrow(args.tenantId, args.campaignId);
    const accessToken = await this.getAccessToken(args.tenantId);

    try { await this.meta.updateCampaign(campaign.metaCampaignId, accessToken, { daily_budget: args.dailyBudget }); }
    catch (err) { this.handleMetaError(err); }

    return this.repo.updateCampaign(args.campaignId, {
      budget: { ...(campaign.budget as Record<string, unknown>), daily_budget: args.dailyBudget },
    } as any);
  }

  async getCampaign(args: { tenantId: string; campaignId: string }) {
    return this.findCampaignOrThrow(args.tenantId, args.campaignId);
  }

  async getCampaignPanelDetail(args: { tenantId: string; campaignId: string }): Promise<{
    campaign: { id: string; name: string; status: string; objective: string | null;
      budget: unknown; metaCampaignId: string; metrics: CampaignPanelMetrics;
      lastSyncedAt: string | null; createdAt: string; };
    recentTakedowns: TakedownItem[]; automationRules: AutomationRuleItem[];
  } | null> {
    const campaign = await this.repo.findCampaignByTenantAndId(args.tenantId, args.campaignId);
    if (!campaign) return null;

    const [recentTakedownsRows, rulesRows] = await Promise.all([
      this.repo.findRecentTakedowns(args.tenantId, args.campaignId),
      this.repo.findActiveAutomationRules(args.tenantId),
    ]);

    const budgetObj = campaign.budget as Record<string, unknown> | null | undefined;
    const objective = budgetObj && typeof budgetObj.objective === 'string' ? budgetObj.objective : null;

    return {
      campaign: {
        id: campaign.id, name: campaign.name, status: campaign.status, objective,
        budget: campaign.budget ?? {}, metaCampaignId: campaign.metaCampaignId,
        metrics: normalizeCampaignPanelMetrics(campaign.metrics),
        lastSyncedAt: campaign.lastSyncedAt?.toISOString() ?? null,
        createdAt: campaign.createdAt.toISOString(),
      },
      recentTakedowns: recentTakedownsRows.map((t: any) => ({
        id: t.id, campaignId: t.campaignId, suggestionType: t.suggestionType,
        suggestionData: (t.suggestionData as Record<string, unknown>) ?? {},
        appliedAt: t.appliedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(),
      })),
      automationRules: rulesRows.map((r: any) => ({
        id: r.id, tenantId: r.tenantId, name: r.name, description: r.description,
        trigger: r.trigger, enabled: r.isActive, createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(), ruleType: r.ruleType, isActive: r.isActive,
        threshold: parseFloat(String(r.threshold)) || 0, action: r.action,
      })),
    };
  }

  async getCampaigns(args: { tenantId: string; status?: string; limit: number; offset: number }): Promise<{ items: CampaignListItem[]; total: number }> {
    const result = await this.repo.findCampaigns(args.tenantId, args.status, args.limit, args.offset);
    return { items: result.items.map((c) => formatCampaignListItem(c)), total: result.total };
  }

  async updateCampaign(args: { tenantId: string; campaignId: string; name?: string; budget?: { amount: number; type: 'daily' | 'lifetime'; startDate?: string; endDate?: string } }) {
    const campaign = await this.findCampaignOrThrow(args.tenantId, args.campaignId);
    const accessToken = await this.getAccessToken(args.tenantId);
    const updateBody: Record<string, unknown> = {};
    if (args.name) updateBody.name = args.name;
    if (args.budget) {
      updateBody[args.budget.type === 'daily' ? 'daily_budget' : 'lifetime_budget'] = args.budget.amount;
      if (args.budget.startDate) updateBody.start_date = args.budget.startDate;
      if (args.budget.endDate) updateBody.end_date = args.budget.endDate;
    }

    try { await this.meta.updateCampaign(campaign.metaCampaignId, accessToken, updateBody); }
    catch (err) { this.handleMetaError(err); }

    if (args.name) return this.repo.updateCampaign(args.campaignId, { name: args.name } as any);
    if (args.budget) {
      const updatedBudget = { ...(campaign.budget as Record<string, unknown>) };
      if (args.budget.type === 'daily') updatedBudget.daily_budget = args.budget.amount;
      else updatedBudget.lifetime_budget = args.budget.amount;
      if (args.budget.startDate) updatedBudget.start_date = args.budget.startDate;
      if (args.budget.endDate) updatedBudget.end_date = args.budget.endDate;
      return this.repo.updateCampaign(args.campaignId, { budget: updatedBudget } as any);
    }
    return campaign;
  }

  async updateCampaignStatus(args: { tenantId: string; campaignId: string; status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'; userId: string }) {
    const campaign = await this.findCampaignOrThrow(args.tenantId, args.campaignId);
    const accessToken = await this.getAccessToken(args.tenantId);

    try { await this.meta.updateCampaign(campaign.metaCampaignId, accessToken, { status: args.status }); }
    catch (err) { this.handleMetaError(err); }

    const localStatus = args.status === 'ACTIVE' ? 'active' : args.status === 'PAUSED' ? 'paused' : 'archived';
    const updated = await this.repo.updateCampaign(args.campaignId, { status: localStatus } as any);

    await this.repo.insertFuryInsight({
      tenantId: args.tenantId, campaignId: args.campaignId,
      suggestionType: `campaign_status_${args.status.toLowerCase()}`,
      suggestionData: { userId: args.userId, timestamp: new Date().toISOString(), action: 'manual' },
    } as any);

    return updated;
  }

  async softDeleteCampaign(args: { tenantId: string; campaignId: string; userId: string }) {
    const campaign = await this.findCampaignOrThrow(args.tenantId, args.campaignId);
    const accessToken = await this.getAccessToken(args.tenantId);

    try { await this.meta.updateCampaign(campaign.metaCampaignId, accessToken, { status: 'ARCHIVED' }); }
    catch (err) { this.handleMetaError(err); }

    const deleted = await this.repo.updateCampaign(args.campaignId, { status: 'archived' } as any);

    await this.repo.insertFuryInsight({
      tenantId: args.tenantId, campaignId: args.campaignId,
      suggestionType: 'campaign_archived',
      suggestionData: { userId: args.userId, timestamp: new Date().toISOString(), action: 'manual' },
    } as any);

    return deleted;
  }

  async getCampaignInsights(args: {
    tenantId: string; campaignId: string;
    dateRange: 'last_7d' | 'last_30d' | 'last_90d' | 'custom';
    startDate?: string; endDate?: string;
  }) {
    const accessToken = await this.getAccessToken(args.tenantId);

    const dbCampaign = await this.repo.findCampaignByMetaId(args.tenantId, args.campaignId);

    let campaignBlock: { id: string; name: string; status: string } = {
      id: args.campaignId, name: `Campaign ${args.campaignId}`, status: 'ACTIVE',
    };
    let campaignObjective: string | null = null;

    if (dbCampaign) {
      const statusMap: Record<string, string> = { ativo: 'ACTIVE', pausado: 'PAUSED', arquivado: 'ARCHIVED' };
      campaignBlock = { id: dbCampaign.metaCampaignId, name: dbCampaign.name, status: statusMap[dbCampaign.status] ?? dbCampaign.status.toUpperCase() };
      const budgetObj = dbCampaign.budget as Record<string, unknown> | null | undefined;
      const wizardObjective = budgetObj && typeof budgetObj.objective === 'string' ? budgetObj.objective : null;
      campaignObjective = wizardObjective ? (WIZARD_OBJECTIVE_MAP[wizardObjective as WizardObjective]?.metaObjective ?? wizardObjective) : null;
    } else {
      try {
        const meta = await this.meta.getCampaign(args.campaignId, accessToken, 'name,status,objective');
        campaignBlock = { id: args.campaignId, name: (meta.name as string) || `Campaign ${args.campaignId}`, status: ((meta.status as string) || 'ACTIVE').toUpperCase() };
        campaignObjective = (meta.objective as string) ?? null;
      } catch { /* keep defaults */ }
    }

    const { startDate, endDate } = calculateDateRange(args.dateRange, args.startDate, args.endDate);

    try {
      const response = await this.meta.getInsights({ accessToken, entityId: args.campaignId, startDate, endDate, timeIncrement: 1 });

      const timeseries = (response.data || []).map((item: any) => {
        const spend = parseFloat(item.spend || '0');
        const impressions = parseInt(item.impressions || '0', 10);
        const clicks = parseInt(item.clicks || '0', 10);
        const ctr = parseFloat(item.ctr || '0');
        const cpc = parseFloat(item.cpc || '0');
        const cpm = parseFloat(item.cpm || '0');
        const conversions = parseConversionsFromActions(item.actions, campaignObjective, item.unique_actions) ?? 0;
        const roas = parseRoasFromPurchaseRoas(item.purchase_roas) ?? null;
        const cpa = (conversions > 0 ? roundToDecimals(spend / conversions, 2) : null) ?? parseCpaFromCostPerAction(item.cost_per_action_type);
        return { date: item.date_start || item.date_stop || '', spend, impressions, clicks, ctr, cpc, cpm, roas, cpa, conversions };
      });

      // ponytail: busca criativos da campanha; falha silenciosa se API não retornar dados
      let creatives: { id: string; name: string; status: string; thumbnailUrl?: string; imageUrl?: string; headline?: string; primaryText?: string; isVideo: boolean }[] = [];
      try {
        const ads = await getCampaignAds(args.campaignId, accessToken);
        creatives = ads.map((ad) => {
          const c = ad.creative;
          const linkData = c?.object_story_spec?.link_data;
          const videoData = c?.object_story_spec?.video_data;
          const photoData = c?.object_story_spec?.photo_data;
          return {
            id: ad.id,
            name: ad.name,
            status: ad.status,
            thumbnailUrl: c?.thumbnail_url,
            imageUrl: linkData?.image_url ?? videoData?.image_url ?? photoData?.url,
            headline: linkData?.name,
            primaryText: linkData?.message ?? photoData?.caption,
            isVideo: !!videoData?.video_id,
          };
        });
      } catch {
        console.warn('[getCampaignInsights] Failed to fetch creatives for campaign', args.campaignId);
      }

      // fallback: se Meta não retornou criativos, busca do banco local
      if (creatives.length === 0 && dbCampaign) {
        const budget = dbCampaign.budget as Record<string, unknown> | null | undefined;
        const localImageUrl = budget?.creative_image_url as string | undefined;
        const localAssetId = budget?.creative_asset_id as string | undefined;

        let resolvedUrl = localImageUrl;
        if (localAssetId && !resolvedUrl) {
          try {
            const asset = await this.repo.findCreativeAsset(localAssetId, args.tenantId);
            if (asset) resolvedUrl = asset.url;
          } catch { /* silêncio */ }
        }

        if (resolvedUrl) {
          creatives.push({
            id: `local-${dbCampaign.id}`,
            name: dbCampaign.name,
            status: campaignBlock.status,
            imageUrl: resolvedUrl,
            headline: budget?.creative_headline as string | undefined,
            primaryText: budget?.creative_primary_text as string | undefined,
            isVideo: false,
          });
        }
      }

      return { campaign: campaignBlock, timeseries, creatives };
    } catch (err) {
      console.error('[getCampaignInsights] Meta API error:', err);
      const metaCode = (err as any).metaCode;
      if (metaCode === 190) throw new AppError(401, 'META_TOKEN_EXPIRED', 'Token Meta expirado. Reconecte sua conta em Configurações > Integrações');
      throw err;
    }
  }

  async createCampaignFromWizard(args: CreateWizardCampaignArgs): Promise<CreateWizardCampaignResult> {
    const metaConn = await this.repo.findMetaConnection(args.tenantId);
    if (!metaConn) throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'No Meta connection found for this tenant');

    const adAccountId = metaConn.selectedAdAccountId;
    if (!adAccountId) throw new AppError(400, 'AD_ACCOUNT_NOT_SELECTED', 'Nenhuma conta de anúncios selecionada. Configure em Configurações → Integrações.');

    const accessToken = this.deps.decryptMetaToken(metaConn.accessToken);
    const objectiveConfig = WIZARD_OBJECTIVE_MAP[args.objective];

    let messagingDestinations: WizardMessagingDestination[] = [];
    if (args.objective === 'whatsapp') {
      if (!args.whatsappPageId) throw new AppError(400, 'WHATSAPP_PAGE_REQUIRED', 'Selecione a Página do Facebook para receber as mensagens.');
      messagingDestinations = args.destinations && args.destinations.length > 0 ? args.destinations : ['whatsapp'];
      if (messagingDestinations.includes('whatsapp') && !args.whatsappPhoneNumber) throw new AppError(400, 'WHATSAPP_NUMBER_REQUIRED', 'Selecione o número de WhatsApp que receberá as mensagens.');
      if (messagingDestinations.includes('instagram_direct') && !args.instagramUserId) throw new AppError(400, 'INSTAGRAM_USER_ID_REQUIRED', 'Conecte uma conta do Instagram à Página no Meta Business para usar Instagram Direct.');
    }

    let imageUrl = args.creativeInstagramMediaId ? args.creativeMediaUrl : args.creativeUploadUrl;
    if (!imageUrl && args.creativeAssetId) {
      const asset = await this.repo.findCreativeAsset(args.creativeAssetId, args.tenantId);
      if (!asset) throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo não encontrado.');
      imageUrl = asset.url;
    }

    if (!imageUrl && !args.creativeInstagramMediaId) {
      throw new AppError(400, 'CREATIVE_IMAGE_MISSING', 'Selecione uma imagem da galeria ou envie um arquivo.');
    }

    let instagramCreativeActorId: string | undefined;
    let instagramCreativePageId: string | undefined;
    if (args.creativeInstagramMediaId) {
      const assetSelection = await this.deps.getResolvedTenantAssetSelection(args.tenantId);
      const igPage = assetSelection.pages.find((page) => page.instagramUserId);
      if (!igPage?.instagramUserId) throw new AppError(400, 'INSTAGRAM_ACCOUNT_NOT_FOUND', 'Nenhuma conta do Instagram conectada para usar este post como criativo.');
      instagramCreativeActorId = igPage.instagramUserId;
      instagramCreativePageId = igPage.pageId;
    }

    let cityKey = args.locationCityKey;
    if (!cityKey) {
      let locations: any[];
      try { locations = await this.meta.searchLocations(args.locationCity, accessToken); }
      catch (err) { mapWizardMetaError(err, 'location_search'); }
      const match = locations[0];
      if (!match) throw new AppError(400, 'LOCATION_NOT_FOUND', 'Cidade não encontrada. Tente outro nome.');
      cityKey = match.key;
    }

    const today = new Date();
    const dataLabel = today.toLocaleDateString('pt-BR');
    const campaignName = `${objectiveConfig.label} — FURY — ${dataLabel}`;

    const selectedPageIds = (metaConn.selectedPageIds as string[] | null) ?? [];
    const pageId = args.objective === 'whatsapp' ? args.whatsappPageId! : selectedPageIds[0] || process.env.META_PAGE_ID || '';
    if (!pageId) throw new AppError(400, 'PAGE_NOT_FOUND', 'Nenhuma Página do Facebook configurada. Selecione uma página em Configurações → Integrações.');

    let messagingDestinationType: string | undefined;
    let promotedObject: Record<string, unknown> | undefined;

    if (args.objective === 'whatsapp') {
      promotedObject = { page_id: args.whatsappPageId };
      if (messagingDestinations.includes('whatsapp')) promotedObject.whatsapp_phone_number = args.whatsappPhoneNumber;
      messagingDestinationType = messagingDestinations.length > 1 ? 'MESSAGING_APPS'
        : messagingDestinations[0] === 'whatsapp' ? 'WHATSAPP'
        : messagingDestinations[0] === 'instagram_direct' ? 'INSTAGRAM_DIRECT' : 'MESSENGER';
    } else if (args.objective === 'visits' || args.objective === 'whatsapp_conv' || args.objective === 'engagement' || args.objective === 'messages') {
      promotedObject = { page_id: pageId };
    }

    const destinationType = messagingDestinationType || objectiveConfig.destinationType;

    let metaCampaignId: string | undefined;
    let adSetId: string | undefined;
    let adCreativeId: string | undefined;
    let metaAdId: string | undefined;

    try {
      const campaignBody = {
        name: campaignName, objective: objectiveConfig.metaObjective, status: 'ACTIVE',
        special_ad_categories: [], is_adset_budget_sharing_enabled: false,
      };

      let adImageHashPromise: Promise<string | undefined> = Promise.resolve(undefined);
      if (!instagramCreativeActorId && imageUrl) {
        adImageHashPromise = (async () => {
          try {
            const result = await this.meta.downloadImage(imageUrl, AbortSignal.timeout(15_000));
            if (!result) throw new Error(`Falha ao baixar imagem (HTTP). Verifique se a URL está acessível.`);
            if (!result.contentType.includes('jpeg') && !result.contentType.includes('png') && !result.contentType.includes('image/')) {
              throw new Error(`Formato de imagem nao suportado: ${result.contentType || 'desconhecido'}. Use uma imagem JPEG ou PNG acessivel publicamente.`);
            }
            const ext = result.contentType.includes('png') ? 'png' : 'jpg';
            const hash = await this.meta.uploadAdImage({
              adAccountId, base64: result.buffer.toString('base64'),
              filename: `fury_creative_${Date.now()}.${ext}`, accessToken,
            });
            return hash;
          } catch (uploadErr) {
            console.error('[CampaignWizard] Falha ao enviar imagem para Meta, usando URL original:', uploadErr);
            return undefined;
          }
        })();
      }

      const campaignResponse = await this.meta.createCampaign(adAccountId, accessToken, campaignBody);
      metaCampaignId = campaignResponse.id;

      const targeting: Record<string, unknown> = {
        geo_locations: { cities: [{ key: parseInt(cityKey!, 10), radius: args.locationRadiusKm || 30, distance_unit: 'kilometer' }] },
        age_min: args.ageMin, age_max: args.ageMax,
        genders: args.gender === 'all' ? [1, 2] : args.gender === 'male' ? [1] : [2],
        targeting_automation: { advantage_audience: 0 },
      };

      if (args.audienceInterests && args.audienceInterests.length > 0) {
        targeting.flexible_spec = [{ interests: args.audienceInterests }];
      }

      const adSetBody: Record<string, unknown> = {
        name: `AdSet — ${args.locationCity} — FURY`, campaign_id: metaCampaignId,
        daily_budget: Math.round(args.dailyBudgetBrl * 100),
        billing_event: 'IMPRESSIONS', optimization_goal: objectiveConfig.optimizationGoal,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting, status: 'ACTIVE',
      };
      if (destinationType) adSetBody.destination_type = destinationType;
      if (promotedObject) adSetBody.promoted_object = promotedObject;
      if (args.durationDays) {
        const endTime = new Date(today.getTime() + args.durationDays * 24 * 60 * 60 * 1000);
        adSetBody.end_time = endTime.toISOString();
      }

      const adSetResponse = await this.meta.createAdSet(adAccountId, accessToken, adSetBody);
      adSetId = adSetResponse.id;

      const adImageHash = await adImageHashPromise;

      // ponytail: compute link once instead of re-deriving in the creative spread
      const appUrl = process.env.FURY_APP_URL || process.env.APP_URL || 'https://clickhero-fury-api.u7pe19.easypanel.host';
      const creativeLink = args.objective === 'visits'
        ? args.destinationUrl
        : args.objective === 'whatsapp_conv'
          ? `${appUrl}/api/lp/${args.tenantId}`
          : `https://www.facebook.com/${pageId}`;

      const creativeBody: Record<string, unknown> = instagramCreativeActorId
        ? { object_id: instagramCreativePageId, instagram_user_id: instagramCreativeActorId, source_instagram_media_id: args.creativeInstagramMediaId, call_to_action: JSON.stringify({ type: objectiveConfig.cta === 'MESSAGE_PAGE' ? 'MESSAGE_PAGE' : 'LEARN_MORE', value: { link: args.destinationUrl || `https://www.facebook.com/${instagramCreativePageId}` } }) }
        : { name: 'Creative — FURY', object_story_spec: { page_id: pageId, link_data: { picture: adImageHash || imageUrl, message: args.primaryText, name: args.headline, call_to_action: messagingDestinationType ? { type: messagingDestinations.includes('whatsapp') ? 'WHATSAPP_MESSAGE' : 'MESSAGE_PAGE' } : { type: objectiveConfig.cta }, link: creativeLink } } };

      const adCreativeResponse = await this.meta.createAdCreative(adAccountId, accessToken, creativeBody);
      adCreativeId = adCreativeResponse.id;

      const adResponse = await this.meta.createAd(adAccountId, accessToken, {
        name: `Ad — FURY — ${dataLabel}`, adset_id: adSetId,
        creative: { creative_id: adCreativeId }, status: 'ACTIVE',
      });
      metaAdId = adResponse.id;
    } catch (err) {
      const step = !metaCampaignId ? 'campaign' : !adSetId ? 'adset' : !adCreativeId ? 'creative' : 'ad';
      mapWizardMetaError(err, step);
    }

    const campaign = await this.repo.createCampaign({
      tenantId: args.tenantId, metaCampaignId, name: campaignName, status: 'active',
      budget: {
        daily_budget: Math.round(args.dailyBudgetBrl * 100), objective: objectiveConfig.metaObjective,
        created_via: 'wizard', ad_set_id: adSetId, ad_creative_id: adCreativeId, ad_id: metaAdId,
        duration_days: args.durationDays ?? null,
        creative_asset_id: args.creativeAssetId ?? null,
        creative_image_url: imageUrl ?? null,
        creative_headline: args.headline ?? null,
        creative_primary_text: args.primaryText ?? null,
        ...(args.objective === 'whatsapp' ? {
          destinations: messagingDestinations, destination_type: messagingDestinationType,
          whatsapp_page_id: args.whatsappPageId, whatsapp_page_name: args.whatsappPageName ?? null,
          whatsapp_phone_number_id: messagingDestinations.includes('whatsapp') ? args.whatsappPhoneNumberId ?? null : null,
          whatsapp_phone_number: messagingDestinations.includes('whatsapp') ? args.whatsappPhoneNumber ?? null : null,
          instagram_user_id: messagingDestinations.includes('instagram_direct') ? args.instagramUserId ?? null : null,
          instagram_username: messagingDestinations.includes('instagram_direct') ? args.instagramUsername ?? null : null,
        } : {}),
      },
    } as any);

    await this.deps.invalidateCampaignsCache(args.tenantId);

    return { success: true, campaign_id: campaign.id, meta_campaign_id: metaCampaignId, campaign_name: campaignName };
  }

  async searchMetaLocations(args: { tenantId: string; query: string }): Promise<any[]> {
    const cached = await this.deps.getMetaLocationsCache(args.query);
    if (cached) return cached;

    const accessToken = await this.getAccessToken(args.tenantId);

    let results: any[];
    try { results = await this.meta.searchLocations(args.query, accessToken); }
    catch (err) { mapWizardMetaError(err, 'location_search'); }

    await this.deps.setMetaLocationsCache(args.query, results);
    return results;
  }

  async searchMetaInterests(args: { tenantId: string; query: string }): Promise<any[]> {
    const accessToken = await this.getAccessToken(args.tenantId);
    let results: any[];
    try { results = await searchMetaInterestsLib(args.query, accessToken); }
    catch (err) { return []; }
    return results;
  }
}

// ── Default instance + backward-compatible wrappers ─────────────────────────

const defaultService = new CampaignsService(
  new DefaultMetaCampaignProvider(),
  new DefaultCampaignRepository(),
  {
    decryptMetaToken,
    invalidateCampaignsCache,
    getMetaLocationsCache,
    setMetaLocationsCache,
    getResolvedTenantAssetSelection: ((tenantId: string) =>
      getResolvedTenantAssetSelection(tenantId).then((r) => ({
        pages: r.pages.map((p) => ({ ...p, instagramUserId: p.instagramUserId ?? undefined })),
      }))) as (tenantId: string) => Promise<{ pages: Array<{ instagramUserId?: string; pageId?: string }> }>,
  }
);

export const createCampaign = (args: Parameters<CampaignsService['createCampaign']>[0]) => defaultService.createCampaign(args);
export const pauseCampaign = (args: Parameters<CampaignsService['pauseCampaign']>[0]) => defaultService.pauseCampaign(args);
export const resumeCampaign = (args: Parameters<CampaignsService['resumeCampaign']>[0]) => defaultService.resumeCampaign(args);
export const updateCampaignBudget = (args: Parameters<CampaignsService['updateCampaignBudget']>[0]) => defaultService.updateCampaignBudget(args);
export const getCampaign = (args: Parameters<CampaignsService['getCampaign']>[0]) => defaultService.getCampaign(args);
export const getCampaignPanelDetail = (args: Parameters<CampaignsService['getCampaignPanelDetail']>[0]) => defaultService.getCampaignPanelDetail(args);
export const getCampaigns = (args: Parameters<CampaignsService['getCampaigns']>[0]) => defaultService.getCampaigns(args);
export const updateCampaign = (args: Parameters<CampaignsService['updateCampaign']>[0]) => defaultService.updateCampaign(args);
export const updateCampaignStatus = (args: Parameters<CampaignsService['updateCampaignStatus']>[0]) => defaultService.updateCampaignStatus(args);
export const softDeleteCampaign = (args: Parameters<CampaignsService['softDeleteCampaign']>[0]) => defaultService.softDeleteCampaign(args);
export const getCampaignInsights = (args: Parameters<CampaignsService['getCampaignInsights']>[0]) => defaultService.getCampaignInsights(args);
export const createCampaignFromWizard = (args: Parameters<CampaignsService['createCampaignFromWizard']>[0]) => defaultService.createCampaignFromWizard(args);
export const searchMetaLocations = (args: Parameters<CampaignsService['searchMetaLocations']>[0]) => defaultService.searchMetaLocations(args);
export const searchMetaInterests = (args: Parameters<CampaignsService['searchMetaInterests']>[0]) => defaultService.searchMetaInterests(args);
