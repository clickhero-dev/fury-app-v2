import { db, metaConnections } from '../db.js';
import { eq } from 'drizzle-orm';
import { AppError } from '../../middleware/errorHandler.js';
import { getMetaInsights, metaApiCall, type MetaInsightsData } from '../meta-api.js';
import { decryptMetaToken } from '../../utils/crypto.js';
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
import { isConversionEvent } from '../../utils/meta-conversion-events.js';
import type {
  MetricsSummaryResponse,
  CampaignResponse,
  DailyMetricsResponse,
  CampaignInsightsResponse,
  AdsetResponse,
  GoalsProgressResponse,
} from '../../types/metrics.types.js';
import { getClientGoals } from '../../services/goal-service.js';

export class DatabaseMetricsProvider implements IMetricsProvider {
  private async fetchMetaInsights(params: {
    tenantId: string;
    startDate: string;
    endDate: string;
    adAccountId?: string;
    timeIncrement?: number;
  }): Promise<MetaInsightsData[]> {
    const connection = await db.query.metaConnections.findFirst({
      where: eq(metaConnections.tenantId, params.tenantId),
    });

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

  private normalizeInsights(insights: MetaInsightsData[]): MetricsSummaryResponse {
    const summary = insights.reduce(
      (acc, item) => {
        const spend = parseFloat(item.spend || '0');
        const impressions = parseInt(item.impressions || '0', 10);
        const clicks = parseInt(item.clicks || '0', 10);

        const conversions = parseConversionsFromActions(item.actions) ?? 0;

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
      insights.reduce<number | null>((acc, item) => acc ?? parseCpaFromCostPerAction(item.cost_per_action_type), null) ??
      (summary.conversions > 0 ? calculateCPA(spendReais, summary.conversions) : null);
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

  private mapMetaInsightToDaily(item: MetaInsightsData): DailyMetricsResponse | null {
    if (!item.date_start || !item.date_stop) {
      return null;
    }

    const spend = parseFloat(item.spend || '0');
    const impressions = parseInt(item.impressions || '0', 10);
    const clicks = parseInt(item.clicks || '0', 10);

    const spendReais = centavosToReais(Math.round(spend * 100));
    const { roas, conversions } = extractCampaignMetricsFromInsight(item, spendReais);

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
      const insights = await this.fetchMetaInsights({
        tenantId,
        startDate,
        endDate,
      });

      if (insights.length === 0) {
        return null;
      }

      return this.normalizeInsights(insights);
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
    limit: number = 10
  ): Promise<{
    data: CampaignResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
    };
  }> {
    try {
      const connection = await db.query.metaConnections.findFirst({
        where: eq(metaConnections.tenantId, tenantId),
      });

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

      type MetaCampaignRow = { id: string; name?: string; status?: string };

      const campaignsResp = await metaApiCall<{ data: MetaCampaignRow[] }>(
        `/${encodeURIComponent(adAccountId)}/campaigns?fields=${encodeURIComponent('id,name,status')}`,
        accessToken
      );

      const response = await getMetaInsights({
        accessToken,
        adAccountId,
        startDate,
        endDate,
        level: 'campaign',
      });

      const insights = response.data || [];
      const campaignMeta = new Map(
        (campaignsResp.data || []).map((c) => [c.id, c])
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
        const normalizedStatus = (meta?.status || 'ACTIVE').toUpperCase() as
          | 'ACTIVE'
          | 'PAUSED'
          | 'ARCHIVED';

        if (status && normalizedStatus !== status) {
          continue;
        }

        const insight = insightByCampaignId.get(campaignId);
        if (!insight) {
          campaigns.push({
            id: campaignId,
            name: meta?.name || `Campaign ${campaignId}`,
            status: normalizedStatus,
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
        const { roas, cpa, conversions } = extractCampaignMetricsFromInsight(
          insight,
          spendReais
        );

        campaigns.push({
          id: campaignId,
          name: insight.campaign_name || meta?.name || `Campaign ${campaignId}`,
          status: normalizedStatus,
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
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'META_API_ERROR', 'Erro ao buscar campanhas');
    }
  }

  async getCampaignInsights(
    tenantId: string,
    campaignId: string,
    startDate: string,
    endDate: string
  ): Promise<CampaignInsightsResponse> {
    try {
      const connection = await db.query.metaConnections.findFirst({
        where: eq(metaConnections.tenantId, tenantId),
      });

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
        summary = this.normalizeInsights(insights);
      }

      const dailyRaw: DailyMetricsResponse[] = [];
      for (const item of insights) {
        const row = this.mapMetaInsightToDaily(item);
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
      const connection = await db.query.metaConnections.findFirst({
        where: eq(metaConnections.tenantId, tenantId),
      });

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

          const conversions = (item.actions || [])
            .filter((a) => isConversionEvent(a.action_type))
            .reduce((sum, a) => sum + parseInt(String(a.value), 10), 0);

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
