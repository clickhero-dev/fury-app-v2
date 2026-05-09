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
    return {
      data: [],
      total: 0,
      page,
      pageSize: limit,
    };
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
    return {
      campaign: null,
      summary: null,
      daily: [],
    };
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
}
