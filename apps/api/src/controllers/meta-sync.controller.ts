import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { MetaSyncService, type PartialFailure } from '../services/meta/meta-sync.service.js';
import { MetaSyncRepository } from '../repository/meta-sync.repository.js';

const STALE_MS = 3 * 60 * 60 * 1000;

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});

const listSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
});

const dateRangeSchema = z.object({
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
});

export const LEAD_STATUSES = [
  'novo',
  'não contatado',
  'tentativa de contato',
  'negociando',
  'comprou',
  'não comprou',
] as const;

const updateLeadStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
});

interface FreshContext {
  syncedAt: Date | null;
  staleForMs: number | null;
  degraded: boolean;
  firstSyncPending: boolean;
  partialFailures: PartialFailure[];
  hasData: boolean;
}

function freshnessFields(fresh: FreshContext) {
  return {
    syncedAt: fresh.syncedAt?.toISOString() ?? null,
    staleForMs: fresh.staleForMs,
    degraded: fresh.degraded,
    firstSyncPending: fresh.firstSyncPending,
    partial_failures: fresh.partialFailures,
  };
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
  hasLeadForm: boolean | null;
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
    hasLeadForm: s.hasLeadForm === true,
    lastInsightsAt: s.lastInsightsAt,
  };
}

function toLeadView(l: {
  id?: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  createdTime: Date | null;
  status?: string | null;
  statusUpdatedAt?: Date | null;
}) {
  return {
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    createdAt: l.createdTime ? l.createdTime.toISOString() : null,
    status: l.status ?? 'novo',
    statusUpdatedAt: l.statusUpdatedAt ? l.statusUpdatedAt.toISOString() : null,
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
    private enqueueMetaSync: (args: { tenantId: string; reason: string }) => Promise<void> = async () => {},
  ) {}

  private tenantOf(req: Request): string {
    const tenantId = req.tenant?.tenantId ?? '';
    if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    return tenantId;
  }

  /** Lê sempre do snapshot; stale só enfileira refresh, nunca bloqueia a request com Meta. */
  private async ensureFresh(tenantId: string, repo: MetaSyncRepository): Promise<FreshContext> {
    const lastRun = await repo.lastSuccessfulRun();
    const snapshots = await repo.findCampaignSnapshots({ limit: 1, offset: 0 });
    const hasData = snapshots.total > 0;
    const staleForMs = lastRun ? Math.max(0, Date.now() - lastRun.startedAt.getTime()) : null;
    const degraded = !hasData || staleForMs === null || staleForMs > STALE_MS;

    if (degraded) {
      try {
        await this.enqueueMetaSync({ tenantId, reason: 'stale-fallback' });
      } catch (err) {
        console.warn('[MetaSync] não foi possível enfileirar atualização stale:', (err as Error).message);
      }
    }

    return {
      syncedAt: lastRun?.startedAt ?? null,
      staleForMs,
      degraded,
      firstSyncPending: !hasData,
      partialFailures: [],
      hasData,
    };
  }

  getCampaigns = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const query = listSchema.parse(req.query);
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);

      const { items, total } = await repo.findCampaignSnapshots({
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      });
      let views = items.map(toSnapshotView);
      if (query.startDate && query.endDate) {
        const rows = await repo.findCampaignDailyInsights({ startDate: query.startDate, endDate: query.endDate });
        const grouped = new Map<string, Record<string, number>>();
        for (const row of rows) {
          const metrics = (row.metrics as Record<string, unknown> | null) ?? {};
          const current = grouped.get(row.metaCampaignId) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, weightedRoas: 0, roasSpend: 0 };
          const spend = num(metrics.spend);
          current.spend += spend;
          current.impressions += num(metrics.impressions);
          current.clicks += num(metrics.clicks);
          current.conversions += num(metrics.conversions);
          if (metrics.roas != null) {
            current.weightedRoas += num(metrics.roas) * spend;
            current.roasSpend += spend;
          }
          grouped.set(row.metaCampaignId, current);
        }
        views = views.map((view) => {
          const value = grouped.get(view.id) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, weightedRoas: 0, roasSpend: 0 };
          const roas = value.roasSpend > 0 ? value.weightedRoas / value.roasSpend : null;
          const metrics = {
            spend: value.spend,
            impressions: value.impressions,
            clicks: value.clicks,
            conversions: value.conversions,
            ctr: value.impressions > 0 ? value.clicks / value.impressions * 100 : 0,
            cpc: value.clicks > 0 ? value.spend / value.clicks : 0,
            cpm: value.impressions > 0 ? value.spend / value.impressions * 1000 : 0,
            roas,
            cpa: value.conversions > 0 ? value.spend / value.conversions : null,
          };
          return { ...view, ...metrics, metrics };
        });
      }

      res.json({
        success: true,
        data: views,
        pagination: { total, limit: query.limit, offset: query.offset },
        ...freshnessFields(fresh),
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
        ...freshnessFields(fresh),
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

      const { items } = await repo.findLeadsByCampaign(id, { limit: 500, offset: 0 });

      res.json({
        success: true,
        data: items.map(toLeadView),
        ...freshnessFields(fresh),
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
        ...freshnessFields(fresh),
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

      const rows = await repo.findLeadCampaigns();

      res.json({
        success: true,
        data: rows.map((r) => ({ id: r.metaCampaignId, name: r.name, objective: r.objective })),
        ...freshnessFields(fresh),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /** PATCH /leads/:id/status — alteração manual de status (transições livres). */
  updateLeadStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const { id } = req.params;
      if (!id) throw new AppError(400, 'MISSING_LEAD_ID', 'Lead ID is required');

      const { status } = updateLeadStatusSchema.parse(req.body);

      const repo = this.repoFactory(tenantId);
      const existing = await repo.findLeadById(id);
      if (!existing) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead não encontrado.');

      await repo.updateLeadStatus(id, status);

      res.json({
        success: true,
        data: { id, status },
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

      const query = dateRangeSchema.parse(req.query);
      let agg: ReturnType<typeof aggregateMetrics>;
      if (query.startDate && query.endDate) {
        const rows = await repo.findCampaignDailyInsights({ startDate: query.startDate, endDate: query.endDate });
        const spend = rows.reduce((sum, row) => sum + num((row.metrics as Record<string, unknown> | null)?.spend), 0);
        const impressions = rows.reduce((sum, row) => sum + num((row.metrics as Record<string, unknown> | null)?.impressions), 0);
        const clicks = rows.reduce((sum, row) => sum + num((row.metrics as Record<string, unknown> | null)?.clicks), 0);
        const conversions = rows.reduce((sum, row) => sum + num((row.metrics as Record<string, unknown> | null)?.conversions), 0);
        const roasValue = rows.reduce((sum, row) => {
          const metrics = (row.metrics as Record<string, unknown> | null) ?? {};
          return sum + num(metrics.roas) * num(metrics.spend);
        }, 0);
        agg = { spend, impressions, clicks, conversions, roas: spend > 0 ? roasValue / spend : 0, cpa: conversions > 0 ? spend / conversions : 0 };
      } else {
        const { items } = await repo.findCampaignSnapshots({ limit: 1000, offset: 0 });
        agg = aggregateMetrics(items.map(toSnapshotView));
      }

      res.json({
        success: true,
        data: { summary: agg },
        ...freshnessFields(fresh),
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

      const end = query.endDate ? new Date(query.endDate) : new Date();
      const start = query.startDate ? new Date(query.startDate) : new Date(end.getTime() - 29 * 24 * 3600 * 1000);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Intervalo de datas inválido.');
      }
      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);
      const dailyRows = await repo.findCampaignDailyInsights({ startDate, endDate });
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1);
      const byDate = new Map<string, { spend: number; conversions: number; clicks: number; impressions: number; weightedRoas: number; roasSpend: number }>();
      for (const row of dailyRows) {
        const date = typeof row.date === 'string' ? row.date : new Date(row.date).toISOString().slice(0, 10);
        const metrics = (row.metrics as Record<string, unknown> | null) ?? {};
        const current = byDate.get(date) ?? { spend: 0, conversions: 0, clicks: 0, impressions: 0, weightedRoas: 0, roasSpend: 0 };
        const spend = num(metrics.spend);
        current.spend += spend;
        current.conversions += num(metrics.conversions);
        current.clicks += num(metrics.clicks);
        current.impressions += num(metrics.impressions);
        if (metrics.roas != null) {
          current.weightedRoas += num(metrics.roas) * spend;
          current.roasSpend += spend;
        }
        byDate.set(date, current);
      }
      const data: Array<{ date: string; spend: number; conversions: number; roas: number; clicks: number; impressions: number }> = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(start.getTime() + i * 24 * 3600 * 1000).toISOString().split('T')[0];
        const metrics = byDate.get(date) ?? { spend: 0, conversions: 0, clicks: 0, impressions: 0, weightedRoas: 0, roasSpend: 0 };
        data.push({
          date,
          spend: round(metrics.spend),
          conversions: round(metrics.conversions),
          roas: round(metrics.roasSpend > 0 ? metrics.weightedRoas / metrics.roasSpend : 0),
          clicks: round(metrics.clicks),
          impressions: round(metrics.impressions),
        });
      }

      res.json({
        success: true,
        data,
        ...freshnessFields(fresh),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getGoalsProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = this.tenantOf(req);
      const query = dateRangeSchema.parse(req.query);
      const repo = this.repoFactory(tenantId);
      const fresh = await this.ensureFresh(tenantId, repo);

      let agg: ReturnType<typeof aggregateMetrics>;
      if (query.startDate && query.endDate) {
        const rows = await repo.findCampaignDailyInsights({ startDate: query.startDate, endDate: query.endDate });
        const spend = rows.reduce((sum, row) => sum + num((row.metrics as Record<string, unknown> | null)?.spend), 0);
        const conversions = rows.reduce((sum, row) => sum + num((row.metrics as Record<string, unknown> | null)?.conversions), 0);
        const weightedRoas = rows.reduce((sum, row) => {
          const metrics = (row.metrics as Record<string, unknown> | null) ?? {};
          return sum + num(metrics.roas) * num(metrics.spend);
        }, 0);
        agg = { spend, conversions, impressions: 0, clicks: 0, roas: spend > 0 ? weightedRoas / spend : 0, cpa: conversions > 0 ? spend / conversions : 0 };
      } else {
        const { items } = await repo.findCampaignSnapshots({ limit: 1000, offset: 0 });
        agg = aggregateMetrics(items.map(toSnapshotView));
      }
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
        ...freshnessFields(fresh),
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

      const media = await repo.findInstagramInsights();
      const comments = media.reduce((s, m) => s + (m.commentsCount ?? 0), 0);
      const saves = media.reduce((s, m) => {
        const insights = (m.insights as Record<string, unknown> | null) ?? {};
        return s + num(insights.saved);
      }, 0);

      res.json({
        success: true,
        data: { comments, saves, followers: 0 },
        ...freshnessFields(fresh),
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
