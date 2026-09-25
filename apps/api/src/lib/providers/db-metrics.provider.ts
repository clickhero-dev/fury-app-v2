import { AppError } from '../../middleware/errorHandler.js';
import { MetaRepository } from '../../repository/meta.repository.js';
import { getMetaInsights, metaApiCall, campaignHasLeadForm as metaCampaignHasLeadForm, type MetaInsightsData } from '../meta-api.js';
import { decryptMetaToken } from '../../utils/crypto.js';
import { sanitizeMetaReason, metaErrorCode } from '../meta-error.js';
import { IMetricsProvider } from './metrics.provider.js';
import {
  centavosToReais,
  roundToDecimals,
  calculateCTR,
  calculateCPA,
  calculateCPM,
} from '../../utils/metrics-formatter.js';
import {
  extractCampaignMetricsFromInsight,
  parseConversionsFromActions,
  parseCpaFromCostPerAction,
  parseRoasFromPurchaseRoas,
} from '../../utils/meta-insights-parser.js';
import { getConversionsFromActions } from '../../utils/meta-conversion-events.js';
import type {
  MetricsSummaryResponse,
  CampaignResponse,
  DailyMetricsResponse,
  CampaignInsightsResponse,
  AdsetResponse,
  GoalsProgressResponse,
  PartialFailure,
} from '../../types/metrics.types.js';
import { getClientGoals } from '../../services/campaigns/goal.service.js';

export class DatabaseMetricsProvider implements IMetricsProvider {
  private async fetchMetaInsights(params: {
    tenantId: string;
    startDate: string;
    endDate: string;
    adAccountId?: string;
    timeIncrement?: number;
  }): Promise<MetaInsightsData[]> {
    const connection = await new MetaRepository(params.tenantId).findLatestMetaConnection();

    if (!connection) {
      throw new AppError(
        401,
        'META_NOT_CONNECTED',
        'Conta Meta nao conectada. Acesse Configuracoes > Integracoes.'
      );
    }

    const accessToken = decryptMetaToken(connection.accessToken);
    const adAccounts = (connection.adAccounts as any[]) || [];
    const adAccountId =
      params.adAccountId ||
      (connection as any).selectedAdAccountId ||
      adAccounts.find((a: any) => a.account_status === 1)?.id ||
      adAccounts[0]?.id;

    if (!adAccountId) {
      throw new AppError(400, 'NO_AD_ACCOUNT', 'Nenhuma conta de anuncios encontrada');
    }

    const response = await getMetaInsights({
      accessToken,
      adAccountId,
      startDate: params.startDate,
      endDate: params.endDate,
      timeIncrement: params.timeIncrement,
    });

    return response.data || [];
  }

  private async getConnectionAndAccount(tenantId: string): Promise<{ accessToken: string; adAccountId: string }> {
    const connection = await new MetaRepository(tenantId).findLatestMetaConnection();

    if (!connection) {
      throw new AppError(
        401,
        'META_NOT_CONNECTED',
        'Conta Meta nao conectada. Acesse Configuracoes > Integracoes.'
      );
    }

    const accessToken = decryptMetaToken(connection.accessToken);
    const adAccounts = (connection.adAccounts as any[]) || [];
    const adAccountId =
      (connection as any).selectedAdAccountId ||
      adAccounts.find((a: any) => a.account_status === 1)?.id ||
      adAccounts[0]?.id;

    if (!adAccountId) {
      throw new AppError(400, 'NO_AD_ACCOUNT', 'Nenhuma conta de anuncios encontrada');
    }

    return { accessToken, adAccountId };
  }

  private normalizeInsights(
    insights: MetaInsightsData[],
    objective?: string | null | ((campaignId: string) => string | null)
  ): MetricsSummaryResponse {
    const summary = insights.reduce(
      (acc, item) => {
        const spend = parseFloat(item.spend || '0');
        const impressions = parseInt(item.impressions || '0', 10);
        const clicks = parseInt(item.clicks || '0', 10);

        // Objective-aware: cada campanha usa seu própio objetivo, para que uma
        // campanha de Formulário conte LEADS (quem preencheu), não cliques.
        const obj =
          typeof objective === 'function'
            ? item.campaign_id
              ? objective(item.campaign_id)
              : null
            : objective;
        const conversions = parseConversionsFromActions(item.actions, obj, item.unique_actions) ?? 0;

        const revenue = (item.action_values || [])
          .filter((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.value')
          .reduce((sum, a) => sum + parseFloat(String(a.value)), 0);

        return {
          spend: acc.spend + spend,
          impressions: acc.impressions + impressions,
          clicks: acc.clicks + clicks,
          conversions: acc.conversions + conversions,
          revenue: acc.revenue + revenue,
        };
      },
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
    );

    const spendReais = roundToDecimals(centavosToReais(Math.round(summary.spend * 100)), 2);
    const ctr = calculateCTR(summary.clicks, summary.impressions);
    const cpm = calculateCPM(Math.round(summary.spend * 100), summary.impressions);
    const cpa =
      (summary.conversions > 0 ? calculateCPA(spendReais, summary.conversions) : null) ??
      insights.reduce<number | null>((acc, item) => acc ?? parseCpaFromCostPerAction(item.cost_per_action_type), null);
    const roas =
      insights.reduce<number | null>((acc, item) => acc ?? parseRoasFromPurchaseRoas(item.purchase_roas), null) ??
      (summary.spend > 0 && summary.revenue > 0
        ? summary.revenue / summary.spend
        : null);

    return {
      spend: spendReais,
      impressions: summary.impressions,
      clicks: summary.clicks,
      conversions: summary.conversions,
      ctr,
      cpm,
      cpa: cpa ?? 0,
      roas: roas ?? 0,
    };
  }

  private mapMetaInsightToDaily(item: MetaInsightsData, objective?: string | null): DailyMetricsResponse | null {
    if (!item.date_start || !item.date_stop) {
      return null;
    }

    const spend = parseFloat(item.spend || '0');
    const impressions = parseInt(item.impressions || '0', 10);
    const clicks = parseInt(item.clicks || '0', 10);

    const spendReais = centavosToReais(Math.round(spend * 100));
    const { roas, conversions } = extractCampaignMetricsFromInsight(item, spendReais, objective);

    return {
      date: item.date_start,
      spend: spendReais,
      impressions,
      clicks,
      conversions: conversions ?? 0,
      roas: roas ?? 0,
    };
  }

  private capDailySeries(daily: DailyMetricsResponse[], maxDays: number): DailyMetricsResponse[] {
    const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.length <= maxDays ? sorted : sorted.slice(-maxDays);
  }

  async getSummary(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<MetricsSummaryResponse | null> {
    try {
      const { accessToken, adAccountId } = await this.getConnectionAndAccount(tenantId);

      type MetaCampaignRow = { id: string; status?: string; objective?: string };
      const campaignsResp = await metaApiCall<{ data: MetaCampaignRow[] }>(
        `/${encodeURIComponent(adAccountId)}/campaigns?fields=${encodeURIComponent('id,status,objective')}`,
        accessToken
      );

      const includedStatuses = new Set(['ACTIVE', 'PAUSED']);
      const includedCampaignIds = new Set(
        (campaignsResp.data || [])
          .filter((c) => includedStatuses.has((c.status || '').toUpperCase()))
          .map((c) => c.id)
      );

      // Mapa campanha → objective, para o resumo contar LEADS (quem preencheu)
      // em campanhas de Formulário e não cliques (fallback genérico de tráfego).
      const campaignObjective = new Map<string, string | null>(
        (campaignsResp.data || []).map((c) => [c.id, c.objective ?? null])
      );

      const response = await getMetaInsights({
        accessToken,
        adAccountId,
        startDate,
        endDate,
        level: 'campaign',
      });

      const insights = (response.data || []).filter(
        (item) => item.campaign_id && includedCampaignIds.has(item.campaign_id)
      );

      if (insights.length === 0) {
        return null;
      }

      return this.normalizeInsights(insights, (campaignId) => campaignObjective.get(campaignId) ?? null);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'META_API_ERROR', 'Erro ao buscar resumo de metricas');
    }
  }

  private parseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  async getCampaigns(
    tenantId: string,
    startDate: string,
    endDate: string,
    status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    page: number = 1,
    limit: number = 10,
    includeOnlyLeadForm = false
  ): Promise<{
    data: CampaignResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
    partial_failures: PartialFailure[];
  }> {
    const partialFailures: PartialFailure[] = [];
    const emptyEnvelope = () => ({
      data: [] as CampaignResponse[],
      pagination: { page, limit, total: 0 },
      partial_failures: partialFailures,
    });

    let accessToken: string;
    let adAccountId: string;
    try {
      const connection = await new MetaRepository(tenantId).findLatestMetaConnection();

      if (!connection) {
        partialFailures.push({
          provider: 'meta',
          code: 'META_NOT_CONNECTED',
          reason: 'Conta Meta não conectada. Acesse Configurações → Integrações.',
        });
        return emptyEnvelope();
      }

      accessToken = decryptMetaToken(connection.accessToken);
      const adAccounts = (connection.adAccounts as any[]) || [];
      adAccountId =
        (connection as any).selectedAdAccountId ||
        adAccounts.find((a: any) => a.account_status === 1)?.id ||
        adAccounts[0]?.id;

      if (!adAccountId) {
        partialFailures.push({
          provider: 'meta',
          code: 'NO_AD_ACCOUNT',
          reason: 'Nenhuma conta de anúncios encontrada.',
        });
        return emptyEnvelope();
      }
    } catch (err) {
      partialFailures.push({
        provider: 'meta',
        code: metaErrorCode(err),
        reason: sanitizeMetaReason(err, 'Falha ao acessar a conta Meta.'),
      });
      return emptyEnvelope();
    }

    type MetaCampaignRow = { id: string; name?: string; status?: string; objective?: string };

    // 1) Lista de campanhas da conta (fonte de verdade). Falha aqui → não há o que
    //    listar, mas NÃO engolimos: o erro vem descrito em partial_failures.
    const campaignsRespData: MetaCampaignRow[] | null = await (async (): Promise<MetaCampaignRow[] | null> => {
      try {
        const campaignsResp = await metaApiCall<{ data: MetaCampaignRow[] }>(
          `/${encodeURIComponent(adAccountId)}/campaigns?fields=${encodeURIComponent('id,name,status,objective')}`,
          accessToken
        );
        return campaignsResp.data || [];
      } catch (err) {
        partialFailures.push({
          provider: 'meta',
          code: metaErrorCode(err),
          reason: sanitizeMetaReason(err, 'Não foi possível listar as campanhas da Meta.'),
        });
        return null;
      }
    })();
    if (campaignsRespData === null) {
      return emptyEnvelope();
    }

    // 2) Insights das campanhas. Falha aqui → listamos as campanhas mesmo assim
    //    (com métricas zeradas) + anotamos a falha. Não derruba a lista.
    const insights: MetaInsightsData[] = await (async (): Promise<MetaInsightsData[]> => {
      try {
        const response = await getMetaInsights({
          accessToken,
          adAccountId,
          startDate,
          endDate,
          level: 'campaign',
        });
        return response.data || [];
      } catch (err) {
        partialFailures.push({
          provider: 'meta',
          code: metaErrorCode(err),
          reason: sanitizeMetaReason(err, 'Não foi possível sincronizar as métricas com a Meta.'),
        });
        return [];
      }
    })();

    const campaignMeta = new Map(
      campaignsRespData.map((c) => [c.id, c])
    );
    const insightByCampaignId = new Map(
      insights
        .filter((row) => row.campaign_id)
        .map((row) => [row.campaign_id as string, row])
    );

    const campaignIds = new Set([
      ...campaignMeta.keys(),
      ...insightByCampaignId.keys(),
    ]);

    const campaigns: CampaignResponse[] = [];

    for (const campaignId of campaignIds) {
      const meta = campaignMeta.get(campaignId);
      const normalizedStatus = (meta?.status || 'ARCHIVED').toUpperCase() as
        | 'ACTIVE'
        | 'PAUSED'
        | 'ARCHIVED';

      if (status && normalizedStatus !== status) {
        continue;
      }

      // Filtro "só formulário" (bug 3): só campanhas OUTCOME_LEADS que têm um ad
      // vinculado a lead form. Mesma fonte de verdade da página de Leads
      // (getLeadCampaigns → campaignHasLeadForm). Best-effort: se a detecção de
      // form falhar, mantemos a campanha (não derruba nem esconde).
      if (includeOnlyLeadForm) {
        if (meta?.objective !== 'OUTCOME_LEADS') continue;
        try {
          const hasForm = await metaCampaignHasLeadForm(campaignId, accessToken);
          if (!hasForm) continue;
        } catch (err) {
          partialFailures.push({
            item_id: campaignId,
            provider: 'meta',
            code: metaErrorCode(err),
            reason: sanitizeMetaReason(err, 'Não foi possível confirmar o formulário desta campanha.'),
          });
        }
      }

      const insight = insightByCampaignId.get(campaignId);
      if (!insight) {
        campaigns.push({
          id: campaignId,
          name: meta?.name || `Campaign ${campaignId}`,
          status: normalizedStatus,
          objective: meta?.objective,
          metrics: {
            spend: 0,
            clicks: 0,
            impressions: 0,
            conversions: null,
            roas: null,
            cpa: null,
          },
        });
        continue;
      }

      const spend = parseFloat(insight.spend || '0');
      const spendReais = centavosToReais(Math.round(spend * 100));
      const impressions = parseInt(insight.impressions || '0', 10);
      const clicks = parseInt(insight.clicks || '0', 10);

      // Conversões objective-aware: cada campanha usa o SEU objetivo. Sem isso,
      // uma campanha de Formulário (OUTCOME_LEADS) caía no fallback genérico de
      // tráfego (link_click/landing_page_view) e exibia CLIQUES como "Clientes" —
      // divergindo da página de Leads (que conta quem preencheu o form).
      const { roas, cpa, conversions } = extractCampaignMetricsFromInsight(
        insight,
        spendReais,
        meta?.objective
      );

      campaigns.push({
        id: campaignId,
        name: insight.campaign_name || meta?.name || `Campaign ${campaignId}`,
        status: normalizedStatus,
        objective: meta?.objective,
        metrics: {
          spend: spendReais,
          clicks,
          impressions,
          conversions,
          roas,
          cpa,
        },
      });
    }

    campaigns.sort((a, b) => b.metrics.spend - a.metrics.spend);

    const total = campaigns.length;
    const start = (page - 1) * limit;
    const paginated = campaigns.slice(start, start + limit);

    return {
      data: paginated,
      pagination: {
        page,
        limit,
        total,
      },
      partial_failures: partialFailures,
    };
  }

  async getCampaignInsights(
    tenantId: string,
    campaignId: string,
    startDate: string,
    endDate: string
  ): Promise<CampaignInsightsResponse> {
    try {
      const connection = await new MetaRepository(tenantId).findLatestMetaConnection();

      if (!connection) {
        throw new AppError(
          401,
          'META_NOT_CONNECTED',
          'Conta Meta nao conectada. Acesse Configuracoes > Integracoes.'
        );
      }

      const accessToken = decryptMetaToken(connection.accessToken);

      let campaignBlock: CampaignInsightsResponse['campaign'] = {
        id: campaignId,
        name: `Campaign ${campaignId}`,
        status: 'ACTIVE',
        objective: 'UNKNOWN',
      };

      try {
        const c = await metaApiCall<{
          id?: string;
          name?: string;
          status?: string;
          objective?: string;
        }>(
          `/${campaignId}?fields=${encodeURIComponent('id,name,status,objective')}`,
          accessToken
        );
        campaignBlock = {
          id: c.id || campaignId,
          name: c.name || `Campaign ${campaignId}`,
          status: (c.status || 'ACTIVE').toUpperCase(),
          objective: c.objective || 'UNKNOWN',
        };
      } catch {
        /* fallback ja definido em campaignBlock */
      }

      const response = await getMetaInsights({
        accessToken,
        entityId: campaignId,
        startDate,
        endDate,
        timeIncrement: 1,
      });

      const insights = response.data || [];

      let summary: MetricsSummaryResponse | null = null;
      if (insights.length > 0) {
        summary = this.normalizeInsights(insights, campaignBlock.objective);
      }

      const dailyRaw: DailyMetricsResponse[] = [];
      for (const item of insights) {
        const row = this.mapMetaInsightToDaily(item, campaignBlock.objective);
        if (row) {
          dailyRaw.push(row);
        }
      }

      const daily = this.capDailySeries(dailyRaw, 30);

      return {
        campaign: campaignBlock,
        summary,
        daily,
        creatives: [],
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'META_API_ERROR', 'Erro ao buscar insights da campanha');
    }
  }

  async getCampaignAdsets(tenantId: string, campaignId: string): Promise<AdsetResponse[]> {
    try {
      const connection = await new MetaRepository(tenantId).findLatestMetaConnection();

      if (!connection) {
        throw new AppError(
          401,
          'META_NOT_CONNECTED',
          'Conta Meta nao conectada. Acesse Configuracoes > Integracoes.'
        );
      }

      const accessToken = decryptMetaToken(connection.accessToken);

      const fields = encodeURIComponent(
        'id,name,status,daily_budget,targeting,insights{spend,clicks,ctr,cpm}'
      );
      const payload = await metaApiCall<{ data: any[] }>(
        `/${campaignId}/adsets?fields=${fields}`,
        accessToken
      );

      const rows = payload.data || [];

      return rows.map((adset: any): AdsetResponse => {
        const dailyBudgetRaw = adset.daily_budget;
        const dailyBudget =
          dailyBudgetRaw !== undefined && dailyBudgetRaw !== null
            ? centavosToReais(Math.round(Number(dailyBudgetRaw)))
            : 0;

        const ins = adset.insights?.data?.[0];
        const spendStr = ins?.spend ?? '0';
        const spend = centavosToReais(Math.round(parseFloat(String(spendStr)) * 100));
        const clicks = ins ? parseInt(String(ins.clicks || '0'), 10) : 0;
        const ctr = ins ? parseFloat(String(ins.ctr || '0')) : 0;
        const cpm = ins ? parseFloat(String(ins.cpm || '0')) : 0;

        return {
          id: String(adset.id),
          name: String(adset.name || ''),
          status: String(adset.status || 'UNKNOWN'),
          dailyBudget,
          metrics: { spend, clicks, ctr, cpm },
        };
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'META_API_ERROR', 'Erro ao buscar conjuntos de anuncios');
    }
  }

  async getDailyMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]> {
    try {
      const insights = await this.fetchMetaInsights({
        tenantId,
        startDate,
        endDate,
        timeIncrement: 1,
      });

      return insights
        .filter((item) => item.date_start && item.date_stop)
        .map((item) => {
          const spend = parseFloat(item.spend || '0');
          const impressions = parseInt(item.impressions || '0', 10);
          const clicks = parseInt(item.clicks || '0', 10);

          const conversions = getConversionsFromActions(item.actions) ?? 0;

          const revenue = (item.action_values || [])
            .filter((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.value')
            .reduce((sum, a) => sum + parseFloat(String(a.value)), 0);

          const roas = spend > 0 && revenue > 0 ? roundToDecimals(revenue / spend, 2) : 0;

          return {
            date: item.date_start!,
            spend: centavosToReais(Math.round(spend * 100)),
            impressions,
            clicks,
            conversions,
            roas,
          };
        });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'META_API_ERROR', 'Erro ao buscar metricas diarias');
    }
  }

  async getGoalsProgress(tenantId: string): Promise<GoalsProgressResponse> {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const startDate = monthStart.toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];

      const goals = await getClientGoals(tenantId);

      const insights = await this.fetchMetaInsights({
        tenantId,
        startDate,
        endDate,
      });

      if (insights.length === 0) {
        return {
          goal: {
            id: goals.id,
            targetCpa: goals.targetCpa,
            targetRoas: goals.targetRoas,
            monthlyBudget: goals.monthlyBudget,
          },
          current: 0,
          progressPercent: 0,
          onTrack: false,
        };
      }

      const summary = this.normalizeInsights(insights);
      const estimatedGoalConversions = goals.monthlyBudget / goals.targetCpa;
      const progressPercent =
        estimatedGoalConversions > 0
          ? Math.min(
              Math.round((summary.conversions / estimatedGoalConversions) * 100),
              100
            )
          : 0;
      const onTrack = summary.cpa <= goals.targetCpa * 1.1;

      return {
        goal: {
          id: goals.id,
          targetCpa: goals.targetCpa,
          targetRoas: goals.targetRoas,
          monthlyBudget: goals.monthlyBudget,
        },
        current: summary.conversions,
        progressPercent,
        onTrack,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'META_API_ERROR', 'Erro ao buscar progresso das metas');
    }
  }
}
