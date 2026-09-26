import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { MetaSyncService, type PartialFailure } from '../services/meta/meta-sync.service.js';
import { MetaSyncRepository } from '../repository/meta-sync.repository.js';

const STALE_MS = 15 * 60 * 1000;

const listSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

interface FreshContext {
  syncedAt: Date | null;
  partialFailures: PartialFailure[];
  failed: boolean;
  hasData: boolean;
}

interface SnapshotView {
  id: string;
  name: string;
  status: string | null;
  objective: string | null;
  budget: unknown;
  metrics: Record<string, unknown>;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number | null;
  cpa: number | null;
  conversions: number;
  hasLeadForm: boolean;
  lastInsightsAt: Date | null;
}

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function toSnapshotView(s: {
  metaCampaignId: string;
  name: string;
  status: string | null;
  objective: string | null;
  budget: unknown;
  metrics: unknown;
  hasLeadForm: boolean;
  lastInsightsAt: Date | null;
}): SnapshotView {
  const metrics = (s.metrics as Record<string, unknown> | null) ?? {};
  return {
    id: s.metaCampaignId,
    name: s.name,
    status: s.status,
    objective: s.objective,
    budget: s.budget ?? {},
    metrics,
    spend: num(metrics.spend),
    impressions: num(metrics.impressions),
    clicks: num(metrics.clicks),
    ctr: num(metrics.ctr),
    cpc: num(metrics.cpc),
    cpm: num(metrics.cpm),
    roas: metrics.roas == null ? null : num(metrics.roas),
    cpa: metrics.cpa == null ? null : num(metrics.cpa),
    conversions: num(metrics.conversions),
    hasLeadForm: s.hasLeadForm,
    lastInsightsAt: s.lastInsightsAt,
  };
}

function toLeadView(l: {
  name: string | null;
  email: string | null;
  phone: string | null;
  createdTime: Date | null;
}) {
  return {
    name: l.name,
    email: l.email,
    phone: l.phone,
    createdAt: l.createdTime ? l.createdTime.toISOString() : null,
  };
}

function aggregateMetrics(items: SnapshotView[]): {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  cpa: number;
} {
  const spend = items.reduce((s, i) => s + i.spend, 0);
  const impressions = items.reduce((s, i) => s + i.impressions, 0);
  const clicks = items.reduce((s, i) => s + i.clicks, 0);
  const conversions = items.reduce((s, i) => s + i.conversions, 0);
  const weightedRoas = items.reduce((s, i) => s + (i.roas ?? 0) * i.spend, 0);
  const roas = spend > 0 ? weightedRoas / spend : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;
  return { spend, impressions, clicks, conversions, roas, cpa };
}

/**
 * Controller dos endpoints v2 (dados do banco + fallback stale para a Meta).
 * ADR-0001 (persistência via repository) + ADR-0002 (sync inline com timeout;
 * falha parcial exposta como partial_failures).
 */
export class MetaSyncV2Controller {
  constructor(
    private metaSyncService: MetaSyncService,
    private repoFactory: (tenantId: string) => MetaSyncRepository,
  ) {}

  private tenantOf(req: Request): string {
    const tenantId = req.tenant?.tenantId ?? '';
    if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    return tenantId;
  }

  /** Verifica staleness (>15min do último run de sucesso) e sincroniza inline se preciso. */
  private async ensureFresh(tenantId: string, repo: MetaSyncRepository): Promise<FreshContext> {
    const lastRun = await repo.lastSuccessfulRun();
    const snapshots = await repo.findCampaignSnapshots({ limit: 1, offset: 0 });
    const hasData = snapshots.total > 0;
    const stale = !lastRun || !hasData || Date.now() - lastRun.startedAt.getTime() > STALE_MS;

    if (!stale) {
      return { syncedAt: lastRun!.startedAt, partialFailures: [], failed: false, hasData };
    }

    const result = await this.metaSyncService.syncTenant({ tenantId, reason: 'stale-fallback' });
    const after = await repo.lastSuccessfulRun();
    return {
      syncedAt: after?.startedAt ?? null,
      partialFailures: result.partialFailures,
      failed: result.status === 'failed',
      hasData: hasData || result.campaignsCount > 0,
    };
  }

  /** Sem dados frescos e Meta fora → 502 (ADR-0002: nunca 500 silencioso). */
  private assertData(fresh: FreshContext): void {
    if (fresh.failed && !fresh.hasData) {
      throw new AppError(502, 'META_API_ERROR', 'Não foi possível sincronizar com a Meta no momento. Tente novamente em instantes.');
    }
  }

  getCampaigns = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const query = listSchema.parse(req.query);
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);
      this.assertData(fresh);

      const { items, total } = await repo.findCampaignSnapshots({
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      });

      res.json({
        success: true,
        data: items.map(toSnapshotView),
        pagination: { total, limit: query.limit, offset: query.offset },
        syncedAt: fresh.syncedAt?.toISOString() ?? null,
        partial_failures: fresh.partialFailures,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getCampaignDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const { id } = req.params;
      if (!id) throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);

      const snapshot = await repo.findCampaignSnapshotByMetaId(id);
      if (!snapshot) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campanha não encontrada.');

      res.json({
        success: true,
        data: { ...toSnapshotView(snapshot), syncedAt: fresh.syncedAt?.toISOString() ?? null },
        partial_failures: fresh.partialFailures,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getCampaignLeads = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const { id } = req.params;
      if (!id) throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);
      this.assertData(fresh);

      const { items } = await repo.findLeadsByCampaign(id, { limit: 500, offset: 0 });

      res.json({
        success: true,
        data: items.map(toLeadView),
        syncedAt: fresh.syncedAt?.toISOString() ?? null,
        partial_failures: fresh.partialFailures,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getAllLeads = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);
      this.assertData(fresh);

      const { items } = await repo.findAllLeads({ limit: 500, offset: 0 });
      const snapshots = await repo.findCampaignSnapshots({ limit: 1000, offset: 0 });
      const nameByMeta = new Map(snapshots.items.map((s) => [s.metaCampaignId, s.name]));

      res.json({
        success: true,
        data: items.map((l) => ({
          ...toLeadView(l),
          campaignId: l.metaCampaignId ?? null,
          campaignName: l.metaCampaignId ? (nameByMeta.get(l.metaCampaignId) ?? null) : null,
        })),
        syncedAt: fresh.syncedAt?.toISOString() ?? null,
        partial_failures: fresh.partialFailures,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getLeadCampaigns = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);
      this.assertData(fresh);

      const rows = await repo.findLeadCampaigns();

      res.json({
        success: true,
        data: rows.map((r) => ({ id: r.metaCampaignId, name: r.name, objective: r.objective })),
        syncedAt: fresh.syncedAt?.toISOString() ?? null,
        partial_failures: fresh.partialFailures,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getMetricsSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);
      this.assertData(fresh);

      const { items } = await repo.findCampaignSnapshots({ limit: 1000, offset: 0 });
      const agg = aggregateMetrics(items.map(toSnapshotView));

      res.json({
        success: true,
        data: { summary: agg },
        syncedAt: fresh.syncedAt?.toISOString() ?? null,
        partial_failures: fresh.partialFailures,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getMetricsDaily = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const query = dateRangeSchema.parse(req.query);
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);
      this.assertData(fresh);

      const { items } = await repo.findCampaignSnapshots({ limit: 1000, offset: 0 });
      const agg = aggregateMetrics(items.map(toSnapshotView));

      const end = query.endDate ? new Date(query.endDate) : new Date();
      const start = query.startDate ? new Date(query.startDate) : new Date(end.getTime() - 29 * 24 * 3600 * 1000);
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1);

      const data: Array<{ date: string; spend: number; conversions: number; roas: number; clicks: number; impressions: number }> = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(start.getTime() + i * 24 * 3600 * 1000).toISOString().split('T')[0];
        data.push({
          date,
          spend: round(agg.spend / days),
          conversions: round(agg.conversions / days),
          roas: round(agg.roas),
          clicks: round(agg.clicks / days),
          impressions: round(agg.impressions / days),
        });
      }

      res.json({
        success: true,
        data,
        syncedAt: fresh.syncedAt?.toISOString() ?? null,
        partial_failures: fresh.partialFailures,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getGoalsProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);
      this.assertData(fresh);

      const { items } = await repo.findCampaignSnapshots({ limit: 1000, offset: 0 });
      const agg = aggregateMetrics(items.map(toSnapshotView));
      const goal = await repo.findClientGoal();
      const hasGoals = Boolean(goal);
      const budgetObj = (goal?.monthlyBudget as Record<string, unknown> | null) ?? {};
      const monthlyBudget = num(budgetObj.value ?? budgetObj.amount ?? budgetObj.daily_budget);

      const targetFor = (metric: 'conversions' | 'spend' | 'roas'): number => {
        if (!goal) return 0;
        if (metric === 'conversions') return num(budgetObj.target_conversions ?? budgetObj.goal_conversions);
        if (metric === 'spend') return monthlyBudget;
        if (metric === 'roas') return num(budgetObj.target_roas);
        return 0;
      };

      const currentFor = (metric: 'conversions' | 'spend' | 'roas'): number => {
        if (metric === 'conversions') return agg.conversions;
        if (metric === 'spend') return agg.spend;
        if (metric === 'roas') return agg.roas;
        return 0;
      };

      const goals = (['conversions', 'spend', 'roas'] as const).map((metric) => {
        const target = targetFor(metric);
        const current = currentFor(metric);
        const progress = target > 0 ? Math.round((current / target) * 100) : 0;
        return {
          id: metric,
          name: metric === 'conversions' ? 'Conversões' : metric === 'spend' ? 'Orçamento' : 'ROAS',
          metric,
          unit: '',
          target_value: target,
          current_value: current,
          progress_pct: progress,
          projected_value: current,
          deadline: null,
          status: (hasGoals ? (progress >= 100 ? 'on_track' : 'at_risk') : 'no_goals') as string,
          sparkline: [],
        };
      });

      res.json({
        success: true,
        data: {
          hasGoals,
          objective: goal?.objective ?? null,
          goals,
          primary_goal: goals[0] ?? null,
          days_elapsed: 0,
          days_remaining: 0,
          days_in_month: 30,
          ideal_line: [],
          alerts: [],
        },
        syncedAt: fresh.syncedAt?.toISOString() ?? null,
        partial_failures: fresh.partialFailures,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getInstagramInsights = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);
      this.assertData(fresh);

      const media = await repo.findInstagramInsights();
      const comments = media.reduce((s, m) => s + (m.commentsCount ?? 0), 0);
      const saves = media.reduce((s, m) => {
        const insights = (m.insights as Record<string, unknown> | null) ?? {};
        return s + num(insights.saved);
      }, 0);

      res.json({
        success: true,
        data: { comments, saves, followers: 0 },
        syncedAt: fresh.syncedAt?.toISOString() ?? null,
        partial_failures: fresh.partialFailures,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}