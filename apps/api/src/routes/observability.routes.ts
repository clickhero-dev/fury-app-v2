// ponytail: queries inline — no service/provider layers until needed
import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../lib/db.js';
import { sql } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';

const router = Router();
const CACHE_TTL = 60; // seconds

// Defined query IDs
const QUERIES: Record<string, { label: string; category: 'business' | 'technical'; sql: string }> = {
  // === Business KPIs ===
  B1_campaigns_by_status: {
    label: 'Campanhas por Status',
    category: 'business',
    sql: `SELECT status, COUNT(*) AS total FROM campaigns GROUP BY status ORDER BY total DESC`,
  },
  B2_avg_roas_by_tenant: {
    label: 'ROAS Médio por Tenant',
    category: 'business',
    sql: `SELECT t.name AS tenant, ROUND(AVG(COALESCE((ps.metrics_snapshot->>'roas')::numeric, 0)), 2) AS avg_roas FROM performance_scores ps JOIN campaigns c ON c.id = ps.campaign_id JOIN tenants t ON t.id = ps.tenant_id WHERE ps.computed_at > NOW() - INTERVAL '30 days' GROUP BY t.name ORDER BY avg_roas DESC`,
  },
  B3_total_spend_daily: {
    label: 'Gasto Total Diário',
    category: 'business',
    sql: `SELECT DATE_TRUNC('day', ps.computed_at) AS day, SUM(COALESCE((ps.metrics_snapshot->>'spend')::numeric, 0)) AS total_spend FROM performance_scores ps WHERE ps.computed_at > NOW() - INTERVAL '30 days' GROUP BY day ORDER BY day`,
  },
  B4_performance_grades: {
    label: 'Distribuição de Notas',
    category: 'business',
    sql: `SELECT grade, COUNT(*) AS total FROM performance_scores ps JOIN campaigns c ON c.id = ps.campaign_id WHERE c.status = 'active' AND ps.computed_at > NOW() - INTERVAL '7 days' GROUP BY grade ORDER BY CASE grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 WHEN 'F' THEN 5 END`,
  },
  B5_avg_cpa_by_tenant: {
    label: 'CPA Médio por Tenant',
    category: 'business',
    sql: `SELECT t.name AS tenant, ROUND(AVG(COALESCE((ps.metrics_snapshot->>'cpa')::numeric, 0)), 2) AS avg_cpa FROM performance_scores ps JOIN tenants t ON t.id = ps.tenant_id WHERE ps.computed_at > NOW() - INTERVAL '30 days' GROUP BY t.name ORDER BY avg_cpa ASC`,
  },
  B6_avg_ctr_by_tenant: {
    label: 'CTR Médio por Tenant',
    category: 'business',
    sql: `SELECT t.name AS tenant, ROUND(AVG(COALESCE((ps.metrics_snapshot->>'ctr')::numeric, 0)), 2) AS avg_ctr FROM performance_scores ps JOIN tenants t ON t.id = ps.tenant_id WHERE ps.computed_at > NOW() - INTERVAL '30 days' GROUP BY t.name ORDER BY avg_ctr DESC`,
  },
  B7_active_campaigns_budget: {
    label: 'Campanhas Ativas com Budget',
    category: 'business',
    sql: `SELECT t.name AS tenant, COUNT(*) AS active_campaigns, SUM(COALESCE((c.budget->>'daily_budget')::numeric, 0)) AS total_daily_budget FROM campaigns c JOIN tenants t ON t.id = c.tenant_id WHERE c.status = 'active' GROUP BY t.name ORDER BY total_daily_budget DESC`,
  },
  B8_mrr: {
    label: 'MRR',
    category: 'business',
    sql: `SELECT s.status, COUNT(*) AS subscriptions, COALESCE(SUM(p.price_cents) / 100.0, 0) AS mrr_reais FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status IN ('active', 'trial', 'past_due') GROUP BY s.status ORDER BY mrr_reais DESC`,
  },
  B9_trial_conversion: {
    label: 'Taxa de Conversão Trial',
    category: 'business',
    sql: `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE s.status = 'active') / NULLIF(COUNT(*), 0), 1) AS conversion_pct FROM subscriptions s WHERE s.trial_ends_at IS NOT NULL AND s.created_at > NOW() - INTERVAL '90 days'`,
  },
  B10_form_submissions: {
    label: 'Form Submissions por Tipo',
    category: 'business',
    sql: `SELECT form_type, status, COUNT(*) AS total FROM form_submissions WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY form_type, status ORDER BY form_type, total DESC`,
  },
  // === Technical KPIs ===
  T1_request_volume: {
    label: 'Volume de Requisições',
    category: 'technical',
    sql: `SELECT DATE_TRUNC('minute', created_at) AS minute, COUNT(*) AS requests FROM request_logs WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY minute ORDER BY minute`,
  },
  T2_latency_by_endpoint: {
    label: 'Latência por Endpoint',
    category: 'technical',
    sql: `SELECT method || ' ' || path AS endpoint, COUNT(*) AS calls, ROUND(AVG(response_time_ms)::numeric, 1) AS avg_ms, ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::numeric, 1) AS p95_ms FROM request_logs WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY endpoint ORDER BY avg_ms DESC LIMIT 20`,
  },
  T3_error_rate: {
    label: 'Taxa de Erro',
    category: 'technical',
    sql: `SELECT DATE_TRUNC('hour', created_at) AS hour, COUNT(*) AS total, COUNT(*) FILTER (WHERE status_code >= 500) AS errors, ROUND(100.0 * COUNT(*) FILTER (WHERE status_code >= 500) / NULLIF(COUNT(*), 0), 2) AS error_pct FROM request_logs WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY hour ORDER BY hour`,
  },
  T4_status_codes: {
    label: 'Distribuição de Status Codes',
    category: 'technical',
    sql: `SELECT status_code, COUNT(*) AS total FROM request_logs WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY status_code ORDER BY status_code`,
  },
  T5_top_tenants: {
    label: 'Top Tenants por Volume',
    category: 'technical',
    sql: `SELECT COALESCE(t.name, 'anonymous') AS tenant, COUNT(*) AS requests FROM request_logs rl LEFT JOIN tenants t ON t.id = rl.tenant_id WHERE rl.created_at > NOW() - INTERVAL '1 hour' GROUP BY t.name ORDER BY requests DESC LIMIT 10`,
  },
  T6_rule_executions: {
    label: 'Execuções de Regras',
    category: 'technical',
    sql: `SELECT DATE_TRUNC('hour', triggered_at) AS hour, COUNT(*) AS executions, COUNT(DISTINCT rule_id) AS unique_rules FROM rule_executions WHERE triggered_at > NOW() - INTERVAL '24 hours' GROUP BY hour ORDER BY hour`,
  },
  T7_form_abandon_rate: {
    label: 'Taxa de Abandono de Formulários',
    category: 'technical',
    sql: `SELECT form_type, COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed, COUNT(*) FILTER (WHERE status = 'ABANDONED') AS abandoned, ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'ABANDONED') / NULLIF(COUNT(*), 0), 1) AS abandon_pct FROM form_submissions WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY form_type ORDER BY total DESC`,
  },
  T8_meta_connections: {
    label: 'Meta Connections Ativas',
    category: 'technical',
    sql: `SELECT t.name AS tenant, COUNT(*) AS connections, COUNT(*) FILTER (WHERE mc.token_expires_at > NOW()) AS valid_tokens FROM meta_connections mc JOIN tenants t ON t.id = mc.tenant_id GROUP BY t.name ORDER BY connections DESC`,
  },
  T9_compliance_status: {
    label: 'Criativos por Compliance',
    category: 'technical',
    sql: `SELECT compliance_status, COUNT(*) AS total FROM creative_assets WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY compliance_status ORDER BY total DESC`,
  },
  T10_fury_insights: {
    label: 'Insights Gerados pelo FURY',
    category: 'technical',
    sql: `SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS insights, COUNT(DISTINCT campaign_id) AS campaigns_affected FROM fury_insights WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY day ORDER BY day`,
  },
};

// Cache helper using Redis
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  try {
    const redis = getRedis();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch {
    // ponytail: Redis down → run uncached. No fail.
  }

  const result = await fn();

  try {
    const redis = getRedis();
    await redis.setex(key, ttl, JSON.stringify(result));
  } catch {
    // ponytail: cache write failed, result still returned
  }

  return result;
}

// GET /api/observability/kpis — all KPIs
// GET /api/observability/kpis?kpi=B1_campaigns_by_status — single KPI
router.get('/kpis', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedKpi = req.query.kpi as string | undefined;

    if (requestedKpi) {
      const q = QUERIES[requestedKpi];
      if (!q) {
        res.status(404).json({ success: false, error: { code: 'KPI_NOT_FOUND', message: `KPI '${requestedKpi}' not found` } });
        return;
      }

      const cacheKey = `obs:kpi:${requestedKpi}`;
      const rows = await cached(cacheKey, CACHE_TTL, async () => {
        const result = await db.execute(sql.raw(q.sql));
        return result as unknown as Record<string, unknown>[];
      });

      res.json({ success: true, data: { id: requestedKpi, label: q.label, category: q.category, rows } });
      return;
    }

    // All KPIs — parallel + cached individually
    const cacheKey = 'obs:kpis:all';
    const all = await cached(cacheKey, CACHE_TTL, async () => {
      const entries = await Promise.all(
        Object.entries(QUERIES).map(async ([id, q]) => {
          try {
            const result = await db.execute(sql.raw(q.sql));
            return { id, label: q.label, category: q.category, rows: result as unknown as Record<string, unknown>[] };
          } catch (err: any) {
            return { id, label: q.label, category: q.category, rows: [], error: err.message };
          }
        })
      );
      return entries;
    });

    res.json({ success: true, data: all });
  } catch (err) {
    next(err);
  }
});

// GET /api/observability/kpis/list — query metadata only (no DB)
router.get('/kpis/list', (_req: Request, res: Response) => {
  const list = Object.entries(QUERIES).map(([id, q]) => ({
    id,
    label: q.label,
    category: q.category,
  }));
  res.json({ success: true, data: list });
});

export default router;
