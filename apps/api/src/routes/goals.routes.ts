import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db, clientGoals, campaigns } from '@fury/db';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { MockMetricsProvider } from '../lib/providers/mock-metrics.provider.js';
import { DatabaseMetricsProvider } from '../lib/providers/db-metrics.provider.js';
import type { DailyMetricsResponse } from '../types/metrics.types.js';

const provider =
  process.env.META_USE_MOCK === 'true' && process.env.NODE_ENV !== 'production'
    ? new MockMetricsProvider()
    : new DatabaseMetricsProvider();

const router = Router();
router.use(authMiddleware, tenantMiddleware);

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];
}

function getStatus(projectedPct: number): 'on_track' | 'at_risk' | 'off_track' {
  if (projectedPct >= 90) return 'on_track';
  if (projectedPct >= 60) return 'at_risk';
  return 'off_track';
}

function parseMoneyJson(json: unknown, fallback: number): number {
  const obj = json as { amount?: unknown } | null;
  const raw = Number(obj?.amount ?? 0);
  return Number.isNaN(raw) || raw === 0 ? fallback : raw / 100;
}

// ── GET /api/goals/progress ───────────────────────────────────────────────────

router.get(
  '/progress',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const now = new Date();

      // Allow optional startDate/endDate query params; default to current month
      const qStart = typeof req.query.startDate === 'string' ? req.query.startDate : null;
      const qEnd   = typeof req.query.endDate   === 'string' ? req.query.endDate   : null;

      const defaultMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      const defaultToday = now.toISOString().split('T')[0];

      const monthStart = qStart ?? defaultMonthStart;
      const today      = qEnd   ?? defaultToday;

      // Derive period metadata from the resolved dates
      const periodStart = new Date(monthStart);
      const periodEnd   = new Date(today);
      const periodDays  = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1);

      // For projection we always use the current calendar month's shape
      const total    = daysInMonth(now);
      const elapsed  = Math.max(1, Math.min(periodDays, total));
      const remaining = Math.max(0, total - now.getDate());
      const deadline  = endOfMonth(now);

      // ── 1. Period summary ────────────────────────────────────────────────
      // Wrapped in try/catch: META_NOT_CONNECTED (no integration) should not
      // crash the endpoint — return zero metrics so the layout stays stable.
      let summary = null;
      try {
        summary = await provider.getSummary(tenantId, monthStart, today);
      } catch {
        // No Meta connection or provider error — proceed with zero defaults
      }

      const currentSpend = summary?.spend ?? 0;
      const currentConversions = summary?.conversions ?? 0;
      const currentRoas = summary?.roas ?? 0;
      const currentCpa = summary?.cpa ?? 0;

      // ── 2. Sparkline data (last 7 days of the period) ────────────────────
      const sparkEnd   = new Date(today);
      const sparkStart = new Date(sparkEnd);
      sparkStart.setDate(sparkStart.getDate() - 6);
      const sparkStartStr = sparkStart < periodStart ? monthStart : sparkStart.toISOString().split('T')[0];
      let daily7: DailyMetricsResponse[] = [];
      try {
        daily7 = await provider.getDailyMetrics(tenantId, sparkStartStr, today);
      } catch {
        // No Meta connection — empty sparklines
      }

      // ── 3. Client goals (DB) ─────────────────────────────────────────────
      let targetCpa = 0;
      let targetBudget = 0;
      let targetRoas = 0;
      let objective = 'aumentar_vendas';
      let hasGoals = false;

      try {
        const goalsRow = await db.query.clientGoals.findFirst({
          where: eq(clientGoals.tenantId, tenantId),
        });
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

      // ── 4. Projections (only meaningful when goals exist) ────────────────
      const projConversions = hasGoals ? (currentConversions / elapsed) * total : 0;
      const projSpend = hasGoals ? (currentSpend / elapsed) * total : 0;

      const convProjPct = hasGoals && targetConversions > 0
        ? (projConversions / targetConversions) * 100
        : 0;
      const budgetProjPct = hasGoals && targetBudget > 0
        ? (projSpend / targetBudget) * 100
        : 0;
      const roasProjPct = hasGoals && targetRoas > 0
        ? Math.min(100, (currentRoas / targetRoas) * 100)
        : 0;

      type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'no_goals';

      // ── 5. Goals array ────────────────────────────────────────────────────
      const goals: {
        id: string; name: string; metric: string; unit: string;
        target_value: number; current_value: number; progress_pct: number;
        projected_value: number; deadline: string; status: GoalStatus;
        sparkline: { date: string; value: number }[];
      }[] = [
        {
          id: 'conversions',
          name: 'Conversões',
          metric: 'conversions',
          unit: 'conv.',
          target_value: Math.round(targetConversions),
          current_value: currentConversions,
          progress_pct: hasGoals ? Math.min(100, Math.round((currentConversions / Math.max(1, targetConversions)) * 100)) : 0,
          projected_value: Math.round(projConversions),
          deadline,
          status: hasGoals ? getStatus(convProjPct) : 'no_goals',
          sparkline: daily7.map((d) => ({ date: d.date, value: d.conversions })),
        },
        {
          id: 'budget',
          name: 'Orçamento',
          metric: 'spend',
          unit: 'R$',
          target_value: targetBudget,
          current_value: Math.round(currentSpend * 100) / 100,
          progress_pct: hasGoals ? Math.min(100, Math.round((currentSpend / Math.max(1, targetBudget)) * 100)) : 0,
          projected_value: Math.round(projSpend * 100) / 100,
          deadline,
          status: hasGoals ? getStatus(budgetProjPct) : 'no_goals',
          sparkline: daily7.map((d) => ({ date: d.date, value: Math.round(d.spend) })),
        },
        {
          id: 'roas',
          name: 'ROAS',
          metric: 'roas',
          unit: 'x',
          target_value: targetRoas,
          current_value: Math.round(currentRoas * 100) / 100,
          progress_pct: hasGoals ? Math.min(100, Math.round(roasProjPct)) : 0,
          projected_value: Math.round(currentRoas * 100) / 100,
          deadline,
          status: hasGoals ? getStatus(roasProjPct) : 'no_goals',
          sparkline: daily7.map((d) => ({ date: d.date, value: Math.round(d.roas * 100) / 100 })),
        },
      ];

      // ── 6. Ideal vs Real chart (full month so far) ────────────────────────
      let fullMonthDaily: DailyMetricsResponse[] = [];
      try {
        fullMonthDaily = await provider.getDailyMetrics(tenantId, monthStart, today);
      } catch {
        // No Meta connection — empty chart
      }
      const sorted = [...fullMonthDaily].sort((a, b) => a.date.localeCompare(b.date));

      let cumReal = 0;
      const idealLine = sorted.map((d) => {
        cumReal += d.conversions;
        const dayNum = new Date(d.date).getDate();
        const ideal = Math.round((targetConversions / total) * dayNum * 10) / 10;
        return { date: d.date, real: cumReal, ideal };
      });

      // Also add projected end point
      if (remaining > 0) {
        idealLine.push({
          date: deadline,
          real: Math.round(projConversions),
          ideal: Math.round(targetConversions),
        });
      }

      // ── 7. FURY Alerts (campaigns with CPA > 120% of target) ─────────────
      let alerts: {
        campaignId: string;
        campaignName: string;
        metric: string;
        current_value: number;
        target_value: number;
        deviation_pct: number;
        type: 'cpa_high' | 'roas_low' | 'spend_low';
      }[] = [];

      try {
        const activeCampaigns = await db.query.campaigns.findMany({
          where: eq(campaigns.tenantId, tenantId),
        });

        alerts = activeCampaigns
          .filter((c) => c.status === 'active')
          .flatMap((c) => {
            const m = (c.metrics ?? {}) as Record<string, unknown>;
            const cpa = Number(m.cpa ?? 0);
            const roas = Number(m.roas ?? 0);
            const results: typeof alerts = [];

            if (cpa > 0 && cpa > targetCpa * 1.2) {
              const dev = Math.round(((cpa - targetCpa) / targetCpa) * 100);
              results.push({
                campaignId: c.id,
                campaignName: c.name,
                metric: 'CPA',
                current_value: Math.round(cpa * 100) / 100,
                target_value: targetCpa,
                deviation_pct: dev,
                type: 'cpa_high',
              });
            }
            if (roas > 0 && roas < targetRoas * 0.7) {
              const dev = Math.round(((targetRoas - roas) / targetRoas) * 100);
              results.push({
                campaignId: c.id,
                campaignName: c.name,
                metric: 'ROAS',
                current_value: Math.round(roas * 100) / 100,
                target_value: targetRoas,
                deviation_pct: -dev,
                type: 'roas_low',
              });
            }
            return results;
          })
          .slice(0, 5);
      } catch {
        // no DB — empty alerts
      }

      res.json({
        success: true,
        data: {
          hasGoals,
          objective,
          goals,
          primary_goal: goals[0],
          days_elapsed: elapsed,
          days_remaining: remaining,
          days_in_month: total,
          ideal_line: hasGoals ? idealLine : [],
          alerts,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
