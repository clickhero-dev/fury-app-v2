import { AppError } from '../../middleware/errorHandler.js';
import { MetaRepository } from '../../repository/meta.repository.js';
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
import { getConversionsFromActions } from '../../utils/meta-conversion-events.js';
import type {
  MetricsSummaryResponse,
  CampaignResponse,
  DailyMetricsResponse,
  CampaignInsightsResponse,
  AdsetResponse,
  GoalsProgressResponse,
} from '../../types/metrics.types.js';
import { getClientGoals } from '../../services/campaigns/goal.service.js';
import { MetricsDailyRepository } from '../../repository/metrics-daily.repository.js';

/** Range máximo p/ fallback on-demand (proteção de quota Meta). */
const MAX_ON_DEMAND_DAYS = 180;

export class DatabaseMetricsProvider implements IMetricsProvider {
  /**
   * Cobertura do rollup é suficiente p/ o range pedido?
   * Suficiente = bordas contidas: [startDate..endDate] ⊆ [minDate..maxDate] do
   * tenant. Dias sem atividade dentro da janela NÃO disparam on-demand (a Meta
   * também não teria insights nesses dias — zeros são o valor correto).
   * (Comentário antigo dizia o contrário da implementação — corrigido, fix #173.)
   */
  private async rollupCoversRange(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<boolean> {
    const repo = new MetricsDailyRepository(tenantId);
    const { minDate, maxDate } = await repo.getCoverage();
    if (!minDate || !maxDate) return false;
    return startDate >= minDate && endDate <= maxDate;
  }

  private rangeDays(startDate: string, endDate: string): number {
    const ms = new Date(endDate + 'T00:00:00Z').getTime() - new Date(startDate + 'T00:00:00Z').getTime();
    return Math.floor(ms / 86_400_000);
  }

  /**
   * Fallback on-demand (US3): busca o range na Meta e grava no rollup.
   * Chamado APENAS quando o rollup não cobre o range e o range ≤ 180d.
   * Falha da Meta NÃO derruba o endpoint — devolve false e o caller responde
   * com o que existe localmente (zeros).
   */
  private async backfillOnDemand(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<boolean> {
    if (this.rangeDays(startDate, endDate) > MAX_ON_DEMAND_DAYS) return false;
    try {
      const insights = await this.fetchMetaInsights({
        tenantId,
        startDate,
        endDate,
        timeIncrement: 1,
      });
      if (insights.length === 0) return false;

      const rows = insights
        .map((item) => {
          const campaignId = item.campaign_id;
          const date = item.date_start || item.date_stop;
          if (!campaignId || !date) return null;
          const spendReais = centavosToReais(Math.round(parseFloat(item.spend || '0') * 100));
          const { roas, cpa, conversions } = extractCampaignMetricsFromInsight(item, spendReais);
          return {
            campaignMetaId: campaignId,
            date,
            campaignName: item.campaign_name ?? null,
            objective: null,
            spend: spendReais,
            impressions: parseInt(item.impressions || '0', 10),
            clicks: parseInt(item.clicks || '0', 10),
            ctr: parseFloat(item.ctr || '0'),
            cpm: parseFloat(item.cpm || '0'),
            cpc: parseFloat(item.cpc || '0'),
            conversions: conversions ?? 0,
            roas,
            cpa,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      await new MetricsDailyRepository(tenantId).upsertBatch(rows);
      return true;
    } catch {
      // Meta indisponível/quota: responde com o rollup existente
      return false;
    }
  }

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

  private normalizeInsights(insights: MetaInsightsData[], objective?: string | null): MetricsSummaryResponse {
    const summary = insights.reduce(
      (acc, item) => {
        const spend = parseFloat(item.spend || '0');
        const impressions = parseInt(item.impressions || '0', 10);
        const clicks = parseInt(item.clicks || '0', 10);

        const conversions = parseConversionsFromActions(item.actions, objective, item.unique_actions) ?? 0;

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
      // 401 se Meta não conectada (contrato preservado)
      await this.getConnectionAndAccount(tenantId);

      const repo = new MetricsDailyRepository(tenantId);

      // Caminho novo: rollup cobre o range → leitura 100% local (0 Meta)
      if (await this.rollupCoversRange(tenantId, startDate, endDate)) {
        return await this.summaryFromRollup(repo, startDate, endDate);
      }

      // Fallback on-demand (US3): lacuna de cobertura → busca Meta, grava, lê
      await this.backfillOnDemand(tenantId, startDate, endDate);
      return await this.summaryFromRollup(repo, startDate, endDate);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'META_API_ERROR', 'Erro ao buscar resumo de metricas');
    }
  }

  /** Summary a partir do rollup — mesma forma/semântica do normalizeInsights live. */
  private async summaryFromRollup(
    repo: MetricsDailyRepository,
    startDate: string,
    endDate: string
  ): Promise<MetricsSummaryResponse | null> {
    // excludeArchived: paridade com o live (getSummary filtrava ACTIVE/PAUSED;
    // sem o filtro, campanhas arquivadas inflavam o resumo — fix QA #173)
    const summary = await repo.getSummary(startDate, endDate, { excludeArchived: true });
    if (summary.daysCount === 0 && summary.spend === 0 && summary.conversions === 0) {
      return null;
    }
    const ctr = summary.impressions > 0 ? calculateCTR(summary.clicks, summary.impressions) : 0;
    const cpm = summary.impressions > 0 ? (summary.spend / summary.impressions) * 1000 : 0;
    return {
      spend: roundToDecimals(summary.spend, 2),
      impressions: summary.impressions,
      clicks: summary.clicks,
      conversions: summary.conversions,
      ctr,
      cpm,
      cpa: summary.cpa ?? 0,
      roas: summary.roas ?? 0,
    };
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
      const connection = await new MetaRepository(tenantId).findLatestMetaConnection();

      if (!connection) {
        throw new AppError(
          401,
          'META_NOT_CONNECTED',
          'Conta Meta nao conectada. Acesse Configuracoes > Integracoes.'
        );
      }

      // Status/nome live: lista leve da Meta (id,name,status,objective) — única
      // chamada remota deste endpoint. Métricas vêm do rollup (feature 014).
      type MetaCampaignRow = { id: string; name?: string; status?: string; objective?: string };
      const accessToken = decryptMetaToken(connection.accessToken);
      const adAccounts = (connection.adAccounts as any[]) || [];
      const adAccountId =
        (connection as any).selectedAdAccountId ||
        adAccounts.find((a: any) => a.account_status === 1)?.id ||
        adAccounts[0]?.id;

      if (!adAccountId) {
        throw new AppError(400, 'NO_AD_ACCOUNT', 'Nenhuma conta de anuncios encontrada');
      }

      let metaList: MetaCampaignRow[] = [];
      try {
        const campaignsResp = await metaApiCall<{ data: MetaCampaignRow[] }>(
          `/${encodeURIComponent(adAccountId)}/campaigns?fields=${encodeURIComponent('id,name,status,objective')}`,
          accessToken
        );
        metaList = campaignsResp.data || [];
      } catch {
        // lista live é best-effort: sem ela, status deriva do snapshot do rollup
      }
      const campaignMeta = new Map(metaList.map((c) => [c.id, c]));

      // Métricas do rollup (com fallback on-demand p/ lacuna de cobertura)
      const repo = new MetricsDailyRepository(tenantId);
      if (!(await this.rollupCoversRange(tenantId, startDate, endDate))) {
        await this.backfillOnDemand(tenantId, startDate, endDate);
      }
      const totals = await repo.getCampaignTotals(startDate, endDate);

      // união: campanhas com métricas no período + campanhas da Meta sem métricas
      const ids = new Set<string>([
        ...totals.map((t) => t.campaignMetaId),
        ...campaignMeta.keys(),
      ]);

      const campaigns: CampaignResponse[] = [];

      for (const campaignId of ids) {
        const meta = campaignMeta.get(campaignId);
        const total = totals.find((t) => t.campaignMetaId === campaignId);
        // Status: live da Meta primeiro; SEM lista (Meta fora) → snapshot do
        // rollup; sem nenhum → ARCHIVED (comportamento conservador mantido).
        const normalizedStatus = (meta?.status || total?.status || 'ARCHIVED').toUpperCase() as
          | 'ACTIVE'
          | 'PAUSED'
          | 'ARCHIVED';

        if (status && normalizedStatus !== status) {
          continue;
        }

        campaigns.push({
          id: campaignId,
          name: meta?.name || total?.campaignName || `Campaign ${campaignId}`,
          status: normalizedStatus,
          metrics: {
            spend: total?.spend ?? 0,
            clicks: total?.clicks ?? 0,
            impressions: total?.impressions ?? 0,
            conversions: total ? total.conversions : null,
            roas: total?.roas ?? null,
            cpa: total?.cpa ?? null,
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

      // Timeseries do rollup (feature 014): cobertura local primeiro, Meta só
      // em fallback on-demand. campaignBlock/creatives seguem live (T6 spec).
      const repo = new MetricsDailyRepository(tenantId);
      if (!(await this.rollupCoversRange(tenantId, startDate, endDate))) {
        await this.backfillOnDemand(tenantId, startDate, endDate);
      }
      const series = await repo.getCampaignSeries(campaignId, startDate, endDate);

      // Summary do range COMPLETO (antes do cap de 30d do gráfico): o card de
      // resumo deve refletir o período pedido, não a janela truncada.
      // ctr/cpm reais do rollup (fix QA #173 — antes fixos em 0).
      let summary: MetricsSummaryResponse | null = null;
      if (series.length > 0) {
        const totalsFull = series.reduce(
          (acc, d) => ({
            spend: acc.spend + d.spend,
            impressions: acc.impressions + d.impressions,
            clicks: acc.clicks + d.clicks,
            conversions: acc.conversions + d.conversions,
          }),
          { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
        );
        summary = {
          spend: roundToDecimals(totalsFull.spend, 2),
          impressions: totalsFull.impressions,
          clicks: totalsFull.clicks,
          conversions: totalsFull.conversions,
          ctr: totalsFull.impressions > 0 ? calculateCTR(totalsFull.clicks, totalsFull.impressions) : 0,
          cpm: totalsFull.impressions > 0 ? roundToDecimals((totalsFull.spend / totalsFull.impressions) * 1000, 2) : 0,
          cpa: totalsFull.conversions > 0 ? roundToDecimals(totalsFull.spend / totalsFull.conversions, 2) : 0,
          roas: totalsFull.spend > 0
            ? roundToDecimals(series.reduce((s, d) => s + (d.roas ?? 0) * d.spend, 0) / totalsFull.spend, 2)
            : 0,
        };
      }

      const daily = this.capDailySeries(
        series.map((d) => ({
          date: d.date,
          spend: roundToDecimals(d.spend, 2),
          impressions: d.impressions,
          clicks: d.clicks,
          conversions: d.conversions,
          roas: roundToDecimals(d.roas ?? 0, 2),
        })),
        30
      );

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
      // 401 se Meta não conectada (contrato preservado)
      await this.getConnectionAndAccount(tenantId);

      const repo = new MetricsDailyRepository(tenantId);

      // Caminho novo: rollup cobre → série local (0 Meta)
      if (await this.rollupCoversRange(tenantId, startDate, endDate)) {
        return await this.dailyFromRollup(repo, startDate, endDate);
      }

      // Fallback on-demand (US3)
      await this.backfillOnDemand(tenantId, startDate, endDate);
      return await this.dailyFromRollup(repo, startDate, endDate);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'META_API_ERROR', 'Erro ao buscar metricas diarias');
    }
  }

  /** Série diária do rollup — mesma forma do live (roas ponderado por dia). */
  private async dailyFromRollup(
    repo: MetricsDailyRepository,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]> {
    const series = await repo.getDailySeries(startDate, endDate);
    return series.map((d) => ({
      date: d.date,
      spend: roundToDecimals(d.spend, 2),
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      roas: roundToDecimals(d.roas ?? 0, 2),
    }));
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
