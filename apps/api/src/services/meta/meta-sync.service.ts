import { AppError } from '../../middleware/errorHandler.js';
import { decryptMetaToken } from '../../utils/crypto.js';
import { roundToDecimals } from '../../utils/metrics-formatter.js';
import {
  parseConversionsFromActions,
  parseRoasFromPurchaseRoas,
  parseCpaFromCostPerAction,
} from '../../utils/meta-insights-parser.js';
import { sanitizeMetaReason, metaErrorCode } from '../../lib/meta-error.js';
import { MetaRepository } from '../../repository/meta.repository.js';
import { MetaSyncRepository, type MetaLeadUpsert } from '../../repository/meta-sync.repository.js';
import type {
  MetaCampaignSummary,
  MetaInsightsData,
  MetaInsightsResponse,
  InstagramMediaItem,
  InstagramMediaInsights,
} from '../../lib/meta-api.js';

export interface MetaSyncContext {
  accessToken: string;
  adAccountId: string;
  instagramUserId: string | null;
}

/** Porta para as chamadas externas à Meta (ADR-0002 — sempre via metaApiCall com timeout). */
export interface MetaSyncApi {
  listAccountCampaigns(adAccountId: string, accessToken: string): Promise<MetaCampaignSummary[]>;
  campaignHasLeadForm(campaignId: string, accessToken: string): Promise<boolean>;
  getMetaInsights(params: {
    accessToken: string;
    adAccountId?: string;
    entityId?: string;
    startDate: string;
    endDate: string;
    timeIncrement?: number;
    level?: 'account' | 'campaign' | 'adset' | 'ad';
  }): Promise<MetaInsightsResponse>;
  listCampaignAds(campaignId: string, accessToken: string): Promise<Array<{ id: string; name?: string }>>;
  listAdLeads(adId: string, accessToken: string): Promise<Array<Record<string, unknown>>>;
  getInstagramMedia(igUserId: string, accessToken: string): Promise<InstagramMediaItem[]>;
  getInstagramMediaInsights(
    mediaId: string,
    accessToken: string,
    mediaProductType?: InstagramMediaItem['media_product_type']
  ): Promise<InstagramMediaInsights>;
}

export interface MetaSyncServiceDeps {
  repoFactory: (tenantId: string) => MetaSyncRepository;
  getMetaContext: (tenantId: string) => Promise<MetaSyncContext>;
  metaApi: MetaSyncApi;
  invalidateCampaignsCache: (tenantId: string) => Promise<void>;
  invalidateHttpCache: (tenantId: string, pathPrefixes: string[]) => Promise<void>;
}

export interface PartialFailure {
  item_id?: string;
  provider: string;
  code: string;
  reason: string;
}

export interface MetaSyncRunResult {
  status: 'success' | 'partial' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  partialFailures: PartialFailure[];
  campaignsCount: number;
  leadsCount: number;
  insightsCount: number;
  startedAt: Date;
  finishedAt: Date;
}

interface ClassifiedError {
  fatal: boolean;
  code: string;
  reason: string;
}

function classifyError(err: unknown): ClassifiedError {
  if (err instanceof AppError) {
    const fatal = err.statusCode >= 500 || err.code === 'META_TOKEN_EXPIRED';
    return { fatal, code: err.code, reason: sanitizeMetaReason(err) };
  }
  const anyErr = err as any;
  const metaCode = anyErr?.metaCode;
  const httpStatus = anyErr?.httpStatus;
  const message = String(anyErr?.message ?? '');
  if (metaCode === 190) {
    return { fatal: true, code: 'META_TOKEN_EXPIRED', reason: 'Token Meta inválido ou expirado.' };
  }
  if (httpStatus === 504 || httpStatus >= 500 || /timeout/i.test(message)) {
    return { fatal: true, code: 'META_TIMEOUT', reason: 'Timeout ou falha na conexão com o Meta.' };
  }
  return { fatal: false, code: metaErrorCode(err), reason: sanitizeMetaReason(err) };
}

/** Resolve o contexto Meta (token + ad account + instagram) via repository (ADR-0001). */
export async function getMetaSyncContext(tenantId: string): Promise<MetaSyncContext> {
  const repo = new MetaRepository(tenantId);
  const connection = await repo.findLatestMetaConnection();

  if (!connection) {
    // Fallback para token de sistema (padrão campaigns.service.ts). Exige também
    // a ad account configurada via env — sem ela não há como listar campanhas.
    const systemToken = process.env.META_SYSTEM_ACCESS_TOKEN;
    const systemAdAccount = process.env.META_SYSTEM_AD_ACCOUNT_ID;
    if (systemToken && systemAdAccount) {
      return { accessToken: systemToken, adAccountId: systemAdAccount, instagramUserId: null };
    }
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexão Meta para sincronizar.');
  }

  const accessToken = decryptMetaToken(connection.accessToken);

  let adAccountId = connection.selectedAdAccountId ?? null;
  if (!adAccountId) {
    const accounts = (connection.adAccounts as Array<{ id: string }> | null) ?? [];
    adAccountId = accounts[0]?.id ?? null;
  }
  if (!adAccountId) {
    throw new AppError(400, 'AD_ACCOUNT_NOT_SELECTED', 'Nenhuma conta de anúncios selecionada.');
  }

  return {
    accessToken,
    adAccountId,
    instagramUserId: connection.selectedInstagramUserId ?? null,
  };
}

/** Normaliza os insights de uma campanha para o formato das métricas do painel. */
export function insightToMetrics(
  insight: MetaInsightsData,
  objective: string | null
): Record<string, number | null> {
  const spend = parseFloat(insight.spend ?? '0') || 0;
  const impressions = parseInt(insight.impressions ?? '0', 10) || 0;
  const clicks = parseInt(insight.clicks ?? '0', 10) || 0;
  const ctr = parseFloat(insight.ctr ?? '0') || 0;
  const cpc = parseFloat(insight.cpc ?? '0') || 0;
  const cpm = parseFloat(insight.cpm ?? '0') || 0;
  const conversions = parseConversionsFromActions(insight.actions, objective, insight.unique_actions) ?? 0;
  const roas = parseRoasFromPurchaseRoas(insight.purchase_roas) ?? null;
  const cpa =
    conversions > 0
      ? roundToDecimals(spend / conversions, 2)
      : (parseCpaFromCostPerAction(insight.cost_per_action_type) ?? null);
  return { spend, impressions, clicks, ctr, cpc, cpm, conversions, roas, cpa };
}

/** Normaliza field_data de um lead Meta → { name, email, phone, createdTime }. */
export function normalizeLead(
  lead: Record<string, unknown>
): { name: string | null; email: string | null; phone: string | null; createdTime: Date | null } {
  const fields = (lead.field_data ?? []) as Array<{ name?: string; values?: string[] }>;
  const getValue = (names: string[]): string | null => {
    for (const name of names) {
      const field = fields.find((f) => f.name === name);
      if (field?.values?.[0]) return field.values[0];
    }
    return null;
  };
  const createdTime = typeof lead.created_time === 'string' ? new Date(lead.created_time) : null;
  return {
    name: getValue(['full_name', 'first_name']),
    email: getValue(['email']),
    phone: getValue(['phone_number', 'phone']),
    createdTime: Number.isNaN(createdTime?.getTime()) ? null : createdTime,
  };
}

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * MetaSyncService — pipeline assíncrono de sincronização Meta (fluxo de dados v2).
 *
 * Usado pelo worker/manager BullMQ E pelo fallback "stale" dos endpoints v2.
 * ADR-0001 (persistência via repository) + ADR-0002 (todas as chamadas externas
 * passam pelo wrapper da Meta; falha parcial não derruba o restante).
 */
export class MetaSyncService {
  constructor(private deps: MetaSyncServiceDeps) {}

  async syncTenant(args: { tenantId: string; reason: string }): Promise<MetaSyncRunResult> {
    const repo = this.deps.repoFactory(args.tenantId);
    const startedAt = new Date();
    const partialFailures: PartialFailure[] = [];
    let campaignsCount = 0;
    let leadsCount = 0;
    let insightsCount = 0;

    const recordFailed = async (err: unknown): Promise<MetaSyncRunResult> => {
      const { code, reason } = classifyError(err);
      await repo.recordSyncRun({
        status: 'failed',
        errorCode: code,
        errorMessage: reason,
        partialFailures: [],
        campaignsCount: 0,
        leadsCount: 0,
        insightsCount: 0,
      });
      return {
        status: 'failed',
        errorCode: code,
        errorMessage: reason,
        partialFailures: [],
        campaignsCount: 0,
        leadsCount: 0,
        insightsCount: 0,
        startedAt,
        finishedAt: new Date(),
      };
    };

    let ctx: MetaSyncContext;
    try {
      ctx = await this.deps.getMetaContext(args.tenantId);
    } catch (err) {
      return recordFailed(err);
    }

    // 1) Lista TODAS as campanhas da conta (inclui criadas fora do Fury).
    let campaigns: MetaCampaignSummary[];
    try {
      campaigns = await this.deps.metaApi.listAccountCampaigns(ctx.adAccountId, ctx.accessToken);
    } catch (err) {
      const classified = classifyError(err);
      if (classified.fatal) return recordFailed(err);
      return recordFailed(err);
    }
    campaignsCount = campaigns.length;

    // 2) Persiste snapshots em batch (upsert idempotente).
    await repo.upsertCampaignSnapshots(
      campaigns.map((c) => ({
        metaCampaignId: c.id,
        name: c.name ?? c.id,
        status: c.status ?? null,
        objective: c.objective ?? null,
      }))
    );

    // has_lead_form já conhecido (ciclos anteriores) — evita N+1 do campaignHasLeadForm.
    const existing = await repo.findCampaignSnapshots({ limit: 1000, offset: 0 });
    const existingHasForm = new Map<string, boolean | null>(
      existing.items.map((s) => [s.metaCampaignId, s.hasLeadForm])
    );

    // 3) Insights 30d account-level (1 chamada por tenant por ciclo) → espelho local + snapshot.
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - DAYS_30_MS);
      const iso = (d: Date) => d.toISOString().split('T')[0];
      const response = await this.deps.metaApi.getMetaInsights({
        accessToken: ctx.accessToken,
        adAccountId: ctx.adAccountId,
        startDate: iso(startDate),
        endDate: iso(endDate),
        level: 'campaign',
      });
      for (const row of response.data ?? []) {
        if (!row.campaign_id) continue;
        const objective = campaigns.find((c) => c.id === row.campaign_id)?.objective ?? null;
        const metrics = insightToMetrics(row, objective);
        await repo.updateLocalCampaignMetrics(row.campaign_id, metrics);
        await repo.updateSnapshotMetrics(row.campaign_id, metrics);
        insightsCount += 1;
      }
    } catch (err) {
      // Falha de insights NÃO derruba o restante (ADR-0002) — vira partial.
      const { code, reason } = classifyError(err);
      partialFailures.push({ provider: 'meta', code, reason });
    }

    // 4) Leads: só campanhas OUTCOME_LEADS com form (has_lead_form cacheado no snapshot).
    const leadCandidates = campaigns.filter((c) => c.objective === 'OUTCOME_LEADS');
    const localFormMap = await repo.findLocalLeadFormByMetaIds(leadCandidates.map((c) => c.id));
    for (const campaign of leadCandidates) {
      try {
        let hasForm = existingHasForm.get(campaign.id) ?? null;
        if (hasForm === null) {
          const localFormId = localFormMap.get(campaign.id);
          if (localFormId) {
            hasForm = true;
          } else {
            hasForm = await this.deps.metaApi.campaignHasLeadForm(campaign.id, ctx.accessToken);
          }
          await repo.updateSnapshotHasLeadForm(campaign.id, hasForm);
        }
        if (!hasForm) continue;

        const leads = await this.collectLeads(repo, campaign.id, ctx.accessToken);
        if (leads.length > 0) {
          await repo.upsertLeads(leads);
          leadsCount += leads.length;
        }
      } catch (err) {
        const { code, reason } = classifyError(err);
        partialFailures.push({ item_id: campaign.id, provider: 'meta', code, reason });
      }
    }

    // 5) Instagram orgânico: mídia + insights por media (best-effort por media).
    if (ctx.instagramUserId) {
      try {
        const mediaList = await this.deps.metaApi.getInstagramMedia(ctx.instagramUserId, ctx.accessToken);
        const mediaUpserts = [];
        for (const media of mediaList) {
          let insights: InstagramMediaInsights = { reach: 0, saved: 0, shares: 0, replies: 0 };
          try {
            insights = await this.deps.metaApi.getInstagramMediaInsights(
              media.id,
              ctx.accessToken,
              media.media_product_type
            );
          } catch (err) {
            const { code, reason } = classifyError(err);
            partialFailures.push({ item_id: media.id, provider: 'meta', code, reason });
          }
          mediaUpserts.push({
            mediaId: media.id,
            caption: media.caption ?? null,
            mediaUrl: media.media_url ?? null,
            thumbnailUrl: media.thumbnail_url ?? null,
            mediaType: media.media_type ?? null,
            mediaProductType: media.media_product_type ?? null,
            timestamp: media.timestamp ? new Date(media.timestamp) : null,
            likeCount: media.like_count ?? null,
            commentsCount: media.comments_count ?? null,
            insights,
          });
        }
        if (mediaUpserts.length > 0) {
          await repo.upsertInstagramMedia(mediaUpserts);
          insightsCount += mediaUpserts.length;
        }
      } catch (err) {
        const { code, reason } = classifyError(err);
        partialFailures.push({ provider: 'meta', code, reason });
      }
    }

    // 6) Grava o run + invalida caches (best-effort).
    const status = partialFailures.length > 0 ? 'partial' : 'success';
    await repo.recordSyncRun({
      status,
      partialFailures,
      campaignsCount,
      leadsCount,
      insightsCount,
    });

    try {
      await this.deps.invalidateCampaignsCache(args.tenantId);
      await this.deps.invalidateHttpCache(args.tenantId, ['/api/metrics', '/api/goals']);
    } catch (err) {
      console.warn('[MetaSync] falha ao invalidar caches:', (err as Error).message);
    }

    return {
      status,
      partialFailures,
      campaignsCount,
      leadsCount,
      insightsCount,
      startedAt,
      finishedAt: new Date(),
    };
  }

  private async collectLeads(
    repo: MetaSyncRepository,
    campaignId: string,
    accessToken: string
  ): Promise<MetaLeadUpsert[]> {
    const ads = await this.deps.metaApi.listCampaignAds(campaignId, accessToken);
    const seen = new Set<string>();
    const leads: MetaLeadUpsert[] = [];
    for (const ad of ads) {
      const adLeads = await this.deps.metaApi.listAdLeads(ad.id, accessToken);
      for (const lead of adLeads) {
        const leadId = typeof lead.id === 'string' && lead.id ? lead.id : null;
        if (leadId) {
          if (seen.has(leadId)) continue;
          seen.add(leadId);
        }
        const normalized = normalizeLead(lead);
        leads.push({
          metaLeadId: leadId ?? `lead_${Date.now()}_${leads.length}`,
          metaCampaignId: campaignId,
          name: normalized.name,
          email: normalized.email,
          phone: normalized.phone,
          createdTime: normalized.createdTime,
        });
      }
    }
    return leads;
  }
}