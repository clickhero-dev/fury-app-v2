import crypto from 'crypto';
import { db, metaConnections } from '@fury/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../../middleware/errorHandler.js';
import { getMetaInsights, type MetaInsightsData } from '../meta-api.js';
import { mockMetrics } from '../meta-mock.js';
import { IMetricsProvider } from './metrics.provider.js';
import {
  centavosToReais,
  calculateCTR,
  calculateCPA,
  calculateCPM,
} from '../../utils/metrics-formatter.js';
import type {
  MetricsSummaryResponse,
  CampaignResponse,
  DailyMetricsResponse,
} from '../../types/metrics.types';

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
    const adAccountId = params.adAccountId || adAccounts[0]?.id;

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

        const conversions = (item.actions || [])
          .filter(
            (a) =>
              a.action_type === 'purchase' ||
              a.action_type === 'lead' ||
              a.action_type === 'offsite_conversion'
          )
          .reduce((sum, a) => sum + parseInt(String(a.value), 10), 0);

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

    const ctr = calculateCTR(summary.clicks, summary.impressions);
    const cpm = calculateCPM(Math.round(summary.spend * 100), summary.impressions);
    const cpa = calculateCPA(summary.spend, summary.conversions);
    const roas = summary.spend > 0 ? summary.revenue / summary.spend : 0;

    return {
      spend: centavosToReais(Math.round(summary.spend * 100)),
      impressions: summary.impressions,
      clicks: summary.clicks,
      conversions: summary.conversions,
      ctr,
      cpm,
      cpa,
      roas,
    };
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
    total: number;
    page: number;
    pageSize: number;
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

        return {
          id: campaign.campaignId,
          name: campaign.name,
          status: campaign.status,
          spend: centavosToReais(aggregated.totalSpend),
          roas: aggregated.avgRoas,
          cpa: calculateCPA(
            centavosToReais(aggregated.totalSpend),
            aggregated.totalConversions
          ),
          impressions: aggregated.totalImpressions,
          clicks: aggregated.totalClicks,
        };
      });

      campaigns.sort((a, b) => b.spend - a.spend);

      const total = campaigns.length;
      const start = (page - 1) * limit;
      const paginated = campaigns.slice(start, start + limit);

      return {
        data: paginated,
        total,
        page,
        pageSize: limit,
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
      const adAccountId = adAccounts[0]?.id;

      if (!adAccountId) {
        throw new AppError(400, 'NO_AD_ACCOUNT', 'Nenhuma conta de anuncios encontrada');
      }

      const response = await getMetaInsights({
        accessToken,
        adAccountId,
        startDate,
        endDate,
      });

      const insights = response.data || [];
      if (insights.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          pageSize: limit,
        };
      }

      const campaigns: CampaignResponse[] = insights.map((insight) => {
        const spend = parseFloat(insight.spend || '0');
        const impressions = parseInt(insight.impressions || '0', 10);
        const clicks = parseInt(insight.clicks || '0', 10);

        const conversions = (insight.actions || [])
          .filter(
            (a) =>
              a.action_type === 'purchase' ||
              a.action_type === 'lead' ||
              a.action_type === 'offsite_conversion'
          )
          .reduce((sum, a) => sum + parseInt(String(a.value), 10), 0);

        const revenue = (insight.action_values || [])
          .filter((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.value')
          .reduce((sum, a) => sum + parseFloat(String(a.value)), 0);

        const roas = spend > 0 ? revenue / spend : 0;

        return {
          id: `campaign_${Math.random().toString(36).substr(2, 9)}`,
          name: `Campaign ${insight.date_start}`,
          status: 'ACTIVE' as const,
          spend: centavosToReais(Math.round(spend * 100)),
          roas,
          cpa: calculateCPA(centavosToReais(Math.round(spend * 100)), conversions),
          impressions,
          clicks,
        };
      });

      campaigns.sort((a, b) => b.spend - a.spend);

      const total = campaigns.length;
      const start = (page - 1) * limit;
      const paginated = campaigns.slice(start, start + limit);

      return {
        data: paginated,
        total,
        page,
        pageSize: limit,
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
  ): Promise<{
    campaign: { id: string; name: string; status: string } | null;
    summary: MetricsSummaryResponse | null;
    daily: DailyMetricsResponse[];
  }> {
    if (process.env.META_USE_MOCK === 'true') {
      const campaign = mockMetrics.campaigns.find(c => c.campaignId === campaignId);

      if (!campaign) {
        return {
          campaign: null,
          summary: null,
          daily: [],
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

      const daily: DailyMetricsResponse[] = filteredDaily.map(d => ({
        date: d.date,
        spend: centavosToReais(d.spend),
        impressions: d.impressions,
        clicks: d.clicks,
        conversions: d.conversions,
        roas: d.roas,
      }));

      return {
        campaign: {
          id: campaign.campaignId,
          name: campaign.name,
          status: campaign.status,
        },
        summary,
        daily,
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
      const adAccountId = adAccounts[0]?.id;

      if (!adAccountId) {
        throw new AppError(400, 'NO_AD_ACCOUNT', 'Nenhuma conta de anuncios encontrada');
      }

      const response = await getMetaInsights({
        accessToken,
        adAccountId,
        startDate,
        endDate,
      });

      const insights = response.data || [];

      let summary: MetricsSummaryResponse | null = null;
      if (insights.length > 0) {
        summary = this.normalizeInsights(insights);
      }

      const daily: DailyMetricsResponse[] = insights
        .filter((item) => item.date_start && item.date_stop)
        .map((item) => {
          const spend = parseFloat(item.spend || '0');
          const impressions = parseInt(item.impressions || '0', 10);
          const clicks = parseInt(item.clicks || '0', 10);

          const conversions = (item.actions || [])
            .filter(
              (a) =>
                a.action_type === 'purchase' ||
                a.action_type === 'lead' ||
                a.action_type === 'offsite_conversion'
            )
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

      return {
        campaign: {
          id: campaignId,
          name: `Campaign ${campaignId}`,
          status: 'ACTIVE',
        },
        summary,
        daily,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'META_API_ERROR', 'Erro ao buscar insights da campanha');
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
            .filter(
              (a) =>
                a.action_type === 'purchase' ||
                a.action_type === 'lead' ||
                a.action_type === 'offsite_conversion'
            )
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

  async getGoalsProgress(tenantId: string): Promise<
    Array<{
      goal: { id: string; metric: string; target: number };
      current: number;
      progressPercent: number;
      onTrack: boolean;
    }>
  > {
    if (process.env.META_USE_MOCK === 'true') {
      return [];
    }

    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const startDate = monthStart.toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];

      const insights = await this.fetchMetaInsights({
        tenantId,
        startDate,
        endDate,
      });

      if (insights.length === 0) {
        return [];
      }

      const summary = this.normalizeInsights(insights);

      return [
        {
          goal: { id: 'goal_roas', metric: 'roas', target: 3 },
          current: summary.roas,
          progressPercent: (summary.roas / 3) * 100,
          onTrack: summary.roas >= 3,
        },
        {
          goal: { id: 'goal_conversions', metric: 'conversions', target: 100 },
          current: summary.conversions,
          progressPercent: (summary.conversions / 100) * 100,
          onTrack: summary.conversions >= 100,
        },
      ];
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'META_API_ERROR', 'Erro ao buscar progresso das metas');
    }
  }
}
