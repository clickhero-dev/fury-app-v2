import crypto from 'crypto';
import { db, metaConnections } from '../db.js';
import { eq } from 'drizzle-orm';
import { AppError } from '../../middleware/errorHandler.js';
import { getMetaInsights, metaApiCall, type MetaInsightsData } from '../meta-api.js';
import { mockMetrics } from '../meta-mock.js';
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
  private decryptToken(encryptedPayload: string): string {
    const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(':');
    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new AppError(500, 'TOKEN_DECRYPT_ERROR', 'Formato de token criptografado invalido.');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new AppError(500, 'MISSING_ENV', 'JWT_SECRET nao configurada.');
    }

    const key = crypto.createHash('sha256').update(jwtSecret).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

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

    const accessToken = this.decryptToken(connection.accessToken);
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
    if (process.env.META_USE_MOCK === 'true') {
      return mockMetrics.summary;
    }

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
    if (process.env.META_USE_MOCK === 'true') {
      let filtered = mockMetrics.campaigns;

      if (status) {
        filtered = filtered.filter(c => c.status === status);
      }

      const startDateObj = this.parseDate(startDate);
      const endDateObj = this.parseDate(endDate);

      const campaigns: CampaignResponse[] = filtered.map(campaign => {
        const dailyInRange = campaign.daily.filter(d => {
          const d_date = this.parseDate(d.date);
          return d_date >= startDateObj && d_date <= endDateObj;
        });

        const aggregated = dailyInRange.reduce(
          (acc, d) => ({
            totalSpend: acc.totalSpend + d.spend,
            totalImpressions: acc.totalImpressions + d.impressions,
            totalClicks: acc.totalClicks + d.clicks,
            totalConversions: acc.totalConversions + d.conversions,
            avgRoas: dailyInRange.length > 0 ? dailyInRange.reduce((sum, x) => sum + x.roas, 0) / dailyInRange.length : 0,
          }),
          { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0, avgRoas: 0 }
        );

        const spend = roundToDecimals(centavosToReais(aggregated.totalSpend), 2);
        return {
          id: campaign.campaignId,
          name: campaign.name,
          status: campaign.status,
          metrics: {
            spend,
            clicks: aggregated.totalClicks,
            impressions: aggregated.totalImpressions,
            conversions: aggregated.totalConversions,
            roas: aggregated.avgRoas,
            cpa:
              aggregated.totalConversions > 0
                ? calculateCPA(spend, aggregated.totalConversions)
                : null,
          },
        };
      });

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
    }

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

      const accessToken = this.decryptToken(connection.accessToken);
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
    if (process.env.META_USE_MOCK === 'true') {
      const campaign = mockMetrics.campaigns.find(c => c.campaignId === campaignId);

      if (!campaign) {
        return {
          campaign: null,
          summary: null,
          daily: [],
          creatives: [],
        };
      }

      const startDateObj = this.parseDate(startDate);
      const endDateObj = this.parseDate(endDate);

      const filteredDaily = campaign.daily.filter(d => {
        const d_date = this.parseDate(d.date);
        return d_date >= startDateObj && d_date <= endDateObj;
      });

      let summary: MetricsSummaryResponse | null = null;
      if (filteredDaily.length > 0) {
        const aggregated = filteredDaily.reduce(
          (acc, d) => ({
            totalSpend: acc.totalSpend + d.spend,
            totalImpressions: acc.totalImpressions + d.impressions,
            totalClicks: acc.totalClicks + d.clicks,
            totalConversions: acc.totalConversions + d.conversions,
            avgRoas: filteredDaily.reduce((sum, x) => sum + x.roas, 0) / filteredDaily.length,
          }),
          { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalConversions: 0, avgRoas: 0 }
        );

        summary = {
          spend: centavosToReais(aggregated.totalSpend),
          impressions: aggregated.totalImpressions,
          clicks: aggregated.totalClicks,
          ctr: calculateCTR(aggregated.totalClicks, aggregated.totalImpressions),
          cpm: calculateCPM(aggregated.totalSpend, aggregated.totalImpressions),
          cpa: calculateCPA(
            centavosToReais(aggregated.totalSpend),
            aggregated.totalConversions
          ),
          roas: aggregated.avgRoas,
          conversions: aggregated.totalConversions,
        };
      }

      const daily: DailyMetricsResponse[] = this.capDailySeries(
        filteredDaily.map(d => ({
          date: d.date,
          spend: centavosToReais(d.spend),
          impressions: d.impressions,
          clicks: d.clicks,
          conversions: d.conversions,
          roas: d.roas,
        })),
        30
      );

      return {
        campaign: {
          id: campaign.campaignId,
          name: campaign.name,
          status: campaign.status,
          objective: 'OUTCOME_SALES',
        },
        summary,
        daily,
        creatives: [],
      };
    }

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

      const accessToken = this.decryptToken(connection.accessToken);

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
    if (process.env.META_USE_MOCK === 'true') {
      return [
        {
          id: 'mock_adset_1',
          name: 'Conjunto mock',
          status: 'ACTIVE',
          dailyBudget: centavosToReais(50000),
          metrics: {
            spend: 120.5,
            clicks: 400,
            ctr: 2.5,
            cpm: 15.2,
          },
        },
      ];
    }

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

      const accessToken = this.decryptToken(connection.accessToken);

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
    if (process.env.META_USE_MOCK === 'true') {
      const startDateObj = this.parseDate(startDate);
      const endDateObj = this.parseDate(endDate);

      const filtered = mockMetrics.daily.filter(d => {
        const d_date = this.parseDate(d.date);
        return d_date >= startDateObj && d_date <= endDateObj;
      });

      return filtered.map(d => ({
        date: d.date,
        spend: centavosToReais(d.spend),
        impressions: d.impressions,
        clicks: d.clicks,
        conversions: d.conversions,
        roas: d.roas,
      }));
    }

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

          const roas = spend > 0 ? revenue / spend : 0;

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
    if (process.env.META_USE_MOCK === 'true') {
      return {
        goal: {
          id: 'mock_goal',
          targetCpa: 50,
          targetRoas: null,
          monthlyBudget: 10000,
        },
        current: 42,
        progressPercent: 65,
        onTrack: true,
      };
    }

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
