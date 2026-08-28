import type { IMetricsProvider } from '../../lib/providers/metrics.provider.js';
import type { DailyMetricsResponse } from '../../types/metrics.types.js';
import { CampaignRepository } from '../../repository/campaign.repository.js';

/** Subconjunto do repo que o GoalService usa (base + campanhas). */
type GoalRepo = Pick<
  CampaignRepository,
  'findClientGoal' | 'upsertTenantClientGoal' | 'updateTenantClientGoal' | 'findCampaigns'
>;

export interface GoalInput {
  objective: string;
  niche: string;
  mainProduct: string;
  monthlyBudget: number;
  targetCpa: number;
}

export interface ProgressRange {
  start?: string | null;
  end?: string | null;
}

// ── Helpers de dinheiro / data / status (antes viviam na rota) ─────────────────
function toMoney(v: number) {
  return { amount: Math.round(v * 100) };
}
function fromMoney(json: unknown): number {
  const obj = json as { amount?: unknown } | null;
  const raw = Number(obj?.amount ?? 0);
  return Number.isNaN(raw) ? 0 : raw / 100;
}
function parseMoneyJson(json: unknown, fallback: number): number {
  const obj = json as { amount?: unknown } | null;
  const raw = Number(obj?.amount ?? 0);
  return Number.isNaN(raw) || raw === 0 ? fallback : raw / 100;
}
function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
}
function getStatus(projectedPct: number): 'on_track' | 'at_risk' | 'off_track' {
  if (projectedPct >= 90) return 'on_track';
  if (projectedPct >= 60) return 'at_risk';
  return 'off_track';
}
function calcProgressPercent(current: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

/**
 * Service de metas do cliente (clientGoals).
 *
 * Domínio puro: não conhece HTTP. Recebe no construtor o `MetricsProvider` e uma
 * factory de repositório por tenant (para repo scoped). Fase 0/1 — ADR-0001.
 */
export class GoalService {
  constructor(
    private metrics: IMetricsProvider,
    private repoFactory: (tenantId: string) => GoalRepo = (t) => new CampaignRepository(t),
  ) {}

  private repo(tenantId: string): GoalRepo {
    return this.repoFactory(tenantId);
  }

  private serializeGoal(row: any) {
    return {
      ...row,
      monthlyBudget: fromMoney(row.monthlyBudget),
      targetCpa: fromMoney(row.targetCpa),
    };
  }

  async getGoal(tenantId: string) {
    const row = await this.repo(tenantId).findClientGoal();
    return row ? this.serializeGoal(row) : null;
  }

  async upsertGoal(tenantId: string, input: GoalInput) {
    const row = await this.repo(tenantId).upsertTenantClientGoal({
      objective: input.objective,
      niche: input.niche,
      mainProduct: input.mainProduct,
      monthlyBudget: toMoney(input.monthlyBudget),
      targetCpa: toMoney(input.targetCpa),
    });
    return this.serializeGoal(row);
  }

  async updateGoal(tenantId: string, input: GoalInput) {
    const row = await this.repo(tenantId).updateTenantClientGoal({
      objective: input.objective,
      niche: input.niche,
      mainProduct: input.mainProduct,
      monthlyBudget: toMoney(input.monthlyBudget),
      targetCpa: toMoney(input.targetCpa),
      updatedAt: new Date(),
    });
    return row ? this.serializeGoal(row) : null;
  }

  async getProgress(tenantId: string, range?: ProgressRange) {
    const now = new Date();
    const qStart = range?.start ?? null;
    const qEnd = range?.end ?? null;

    const defaultMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultToday = now.toISOString().split('T')[0];
    const monthStart = qStart ?? defaultMonthStart;
    const today = qEnd ?? defaultToday;

    const periodStart = new Date(monthStart);
    const periodEnd = new Date(today);
    const periodDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1);

    const total = daysInMonth(now);
    const elapsed = Math.max(1, Math.min(periodDays, total));
    const remaining = Math.max(0, total - now.getDate());
    const deadline = endOfMonth(now);

    // 1. period summary (tolerante: sem Meta → zeros)
    let summary = null;
    try {
      summary = await this.metrics.getSummary(tenantId, monthStart, today);
    } catch {
      // no Meta connection — proceed with zero defaults
    }
    const currentSpend = summary?.spend ?? 0;
    const currentConversions = summary?.conversions ?? 0;
    const currentRoas = summary?.roas ?? 0;
    const currentCpa = summary?.cpa ?? 0;

    // 2. sparkline (last 7 days)
    const sparkEnd = new Date(today);
    const sparkStart = new Date(sparkEnd);
    sparkStart.setDate(sparkStart.getDate() - 6);
    const sparkStartStr = sparkStart < periodStart ? monthStart : sparkStart.toISOString().split('T')[0];
    let daily7: DailyMetricsResponse[] = [];
    try {
      daily7 = await this.metrics.getDailyMetrics(tenantId, sparkStartStr, today);
    } catch {
      // empty sparklines
    }

    // 3. client goals
    let targetCpa = 0;
    let targetBudget = 0;
    let targetRoas = 0;
    let objective = 'aumentar_vendas';
    let hasGoals = false;
    try {
      const goalsRow = await this.repo(tenantId).findClientGoal();
      if (goalsRow) {
        hasGoals = true;
        targetCpa = parseMoneyJson(goalsRow.targetCpa, 50);
        targetBudget = parseMoneyJson(goalsRow.monthlyBudget, 10_000);
        targetRoas = 3.0;
        objective = goalsRow.objective ?? 'aumentar_vendas';
      }
    } catch {
      // no DB — hasGoals stays false
    }

    const targetConversions = hasGoals && targetCpa > 0 ? targetBudget / targetCpa : 0;

    // 4. projections
    const projConversions = hasGoals ? (currentConversions / elapsed) * total : 0;
    const projSpend = hasGoals ? (currentSpend / elapsed) * total : 0;

    const convProjPct = hasGoals && targetConversions > 0 ? (projConversions / targetConversions) * 100 : 0;
    const budgetProjPct = hasGoals && targetBudget > 0 ? (projSpend / targetBudget) * 100 : 0;
    const roasProjPct = hasGoals && targetRoas > 0 ? Math.min(100, (currentRoas / targetRoas) * 100) : 0;

    type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'no_goals';

    // 5. goals array
    const conversionsProgressPercent = hasGoals ? calcProgressPercent(currentConversions, Math.round(targetConversions)) : 0;
    const budgetProgressPercent = hasGoals ? calcProgressPercent(currentSpend, targetBudget) : 0;
    const roasProgressPercent = hasGoals ? calcProgressPercent(currentRoas, targetRoas) : 0;

    const goals = [
      {
        id: 'conversions', name: 'Conversões', metric: 'conversions', unit: 'conv.',
        target_value: Math.round(targetConversions), current_value: currentConversions,
        progress_pct: conversionsProgressPercent, progressPercent: conversionsProgressPercent,
        projected_value: Math.round(projConversions), deadline,
        status: hasGoals ? getStatus(convProjPct) : 'no_goals',
        sparkline: daily7.map((d) => ({ date: d.date, value: d.conversions })),
      },
      {
        id: 'budget', name: 'Orçamento', metric: 'spend', unit: 'R$',
        target_value: targetBudget, current_value: Math.round(currentSpend * 100) / 100,
        progress_pct: budgetProgressPercent, progressPercent: budgetProgressPercent,
        projected_value: Math.round(projSpend * 100) / 100, deadline,
        status: hasGoals ? getStatus(budgetProjPct) : 'no_goals',
        sparkline: daily7.map((d) => ({ date: d.date, value: Math.round(d.spend) })),
      },
      {
        id: 'roas', name: 'ROAS', metric: 'roas', unit: 'x',
        target_value: targetRoas, current_value: Math.round(currentRoas * 100) / 100,
        progress_pct: roasProgressPercent, progressPercent: roasProgressPercent,
        projected_value: Math.round(currentRoas * 100) / 100, deadline,
        status: hasGoals ? getStatus(roasProjPct) : 'no_goals',
        sparkline: daily7.map((d) => ({ date: d.date, value: Math.round(d.roas * 100) / 100 })),
      },
    ];

    // 6. ideal vs real (full month)
    let fullMonthDaily: DailyMetricsResponse[] = [];
    try {
      fullMonthDaily = await this.metrics.getDailyMetrics(tenantId, monthStart, today);
    } catch {
      // empty chart
    }
    const sorted = [...fullMonthDaily].sort((a, b) => a.date.localeCompare(b.date));

    let cumReal = 0;
    const idealLine = sorted.map((d) => {
      cumReal += d.conversions;
      const dayNum = new Date(d.date).getDate();
      const ideal = Math.round((targetConversions / total) * dayNum * 10) / 10;
      return { date: d.date, real: cumReal, ideal };
    });
    if (remaining > 0) {
      idealLine.push({ date: deadline, real: Math.round(projConversions), ideal: Math.round(targetConversions) });
    }

    // 7. FURY alerts (campaigns com CPA > 120% da meta)
    let alerts: {
      campaignId: string; campaignName: string; metric: string;
      current_value: number; target_value: number; deviation_pct: number;
      type: 'cpa_high' | 'roas_low' | 'spend_low';
    }[] = [];
    try {
      const { items } = await this.repo(tenantId).findCampaigns();
      const activeCampaigns = items ?? [];
      alerts = activeCampaigns
        .filter((c: any) => c.status === 'active')
        .flatMap((c: any) => {
          const m = (c.metrics ?? {}) as Record<string, unknown>;
          const cpa = Number(m.cpa ?? 0);
          const roas = Number(m.roas ?? 0);
          const results: typeof alerts = [];
          if (cpa > 0 && cpa > targetCpa * 1.2) {
            const dev = Math.round(((cpa - targetCpa) / targetCpa) * 100);
            results.push({ campaignId: c.id, campaignName: c.name, metric: 'CPA', current_value: Math.round(cpa * 100) / 100, target_value: targetCpa, deviation_pct: dev, type: 'cpa_high' });
          }
          if (roas > 0 && roas < targetRoas * 0.7) {
            const dev = Math.round(((targetRoas - roas) / targetRoas) * 100);
            results.push({ campaignId: c.id, campaignName: c.name, metric: 'ROAS', current_value: Math.round(roas * 100) / 100, target_value: targetRoas, deviation_pct: -dev, type: 'roas_low' });
          }
          return results;
        })
        .slice(0, 5);
    } catch {
      // no DB — empty alerts
    }

    const primaryGoal = goals[0];
    const onTrack = hasGoals ? convProjPct >= 90 : false;

    return {
      hasGoals,
      objective,
      goals,
      primary_goal: primaryGoal,
      progressPercent: primaryGoal.progressPercent,
      progressLabel: `${primaryGoal.progressPercent}% da meta`,
      onTrack,
      days_elapsed: elapsed,
      days_remaining: remaining,
      days_in_month: total,
      ideal_line: hasGoals ? idealLine : [],
      alerts,
    };
  }
}