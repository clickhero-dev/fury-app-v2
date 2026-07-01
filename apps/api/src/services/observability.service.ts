import { db } from '@fury/db';
import { sql } from 'drizzle-orm';
import type { BusinessKPI, TechnicalKPI, EngagementKPI, KPIQueryParams } from '../types/observability.types.js';

const QUERY_TIMEOUT_MS = 5000;

export class ObservabilityService {
  /**
   * Fetch all KPIs grouped by category
   */
  async getAllKPIs(params: KPIQueryParams): Promise<{
    business?: BusinessKPI;
    technical?: TechnicalKPI;
    engagement?: EngagementKPI;
  }> {
    try {
      const [business, technical, engagement] = await Promise.all([
        this.getBusinessKPIs(params).catch(err => {
          console.error('Business KPIs error:', err);
          return undefined;
        }),
        this.getTechnicalKPIs(params).catch(err => {
          console.error('Technical KPIs error:', err);
          return undefined;
        }),
        this.getEngagementKPIs(params).catch(err => {
          console.error('Engagement KPIs error:', err);
          return undefined;
        }),
      ]);

      return {
        ...(business && { business }),
        ...(technical && { technical }),
        ...(engagement && { engagement }),
      };
    } catch (error) {
      console.error('getAllKPIs error:', error);
      throw error;
    }
  }

  // ==================== BUSINESS KPIs ====================

  private async getBusinessKPIs(params: KPIQueryParams): Promise<BusinessKPI> {
    const result: BusinessKPI = {};

    try {
      result.mrr = await this.getMRR(params);
    } catch (err) {
      console.error('MRR error:', err);
    }

    try {
      result.trialToPaid = await this.getTrialToPaid(params);
    } catch (err) {
      console.error('Trial to Paid error:', err);
    }

    try {
      result.churn = await this.getChurn(params);
    } catch (err) {
      console.error('Churn error:', err);
    }

    try {
      result.roas = await this.getROAS(params);
    } catch (err) {
      console.error('ROAS error:', err);
    }

    return result;
  }

  private async getMRR(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        COALESCE(DATE_TRUNC('month', i.created_at)::DATE, DATE_TRUNC('month', CURRENT_DATE)::DATE) as period_start,
        COALESCE(SUM(i.amount_cents) / 100.0, 0) as mrr_brl,
        COALESCE(COUNT(DISTINCT i.subscription_id), 0) as paid_subscriptions
      FROM invoices i
      WHERE i.status = 'paid'
        AND i.paid_at IS NOT NULL
        AND i.tenant_id = ${tenantId}
        AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY DATE_TRUNC('month', i.created_at)
      UNION ALL
      SELECT
        DATE_TRUNC('month', CURRENT_DATE)::DATE as period_start,
        0 as mrr_brl,
        0 as paid_subscriptions
      WHERE NOT EXISTS (
        SELECT 1 FROM invoices WHERE status = 'paid' AND tenant_id = ${tenantId} AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      )
      LIMIT 1
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      value: parseFloat(row.mrr_brl || 0),
      currency: 'BRL',
      activeSubscriptions: parseInt(row.paid_subscriptions) || 0,
      period: new Date(row.period_start).toISOString().split('T')[0],
    };
  }

  private async getTrialToPaid(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        DATE_TRUNC('month', s.created_at)::DATE as cohort_month,
        COUNT(*) as trials_started,
        COUNT(*) FILTER (WHERE s.status = 'active') as converted_to_active,
        CASE
          WHEN COUNT(*) = 0 THEN NULL
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE s.status = 'active') / COUNT(*), 2)
        END as conversion_rate_pct,
        COUNT(*) FILTER (WHERE s.status IN ('cancelled', 'past_due', 'inactive')) as not_converted
      FROM subscriptions s
      WHERE s.trial_ends_at IS NOT NULL
        AND s.trial_ends_at > s.created_at
        AND s.tenant_id = ${tenantId}
      GROUP BY DATE_TRUNC('month', s.created_at)
      ORDER BY cohort_month DESC
      LIMIT 1
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      value: parseFloat(row.conversion_rate_pct || 0),
      trialsInitiated: parseInt(row.trials_started) || 0,
      conversions: parseInt(row.converted_to_active) || 0,
      period: new Date(row.cohort_month).toISOString().split('T')[0],
      warning: 'Imprecise metric - no status history table. Based on current status only.',
    };
  }

  private async getChurn(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        DATE_TRUNC('month', s.updated_at)::DATE as churn_month,
        COUNT(*) as churned_subscriptions,
        COUNT(*) FILTER (WHERE s.created_at < DATE_TRUNC('month', s.updated_at)) as active_at_start,
        ROUND(
          100.0 * COUNT(*) /
          NULLIF(COUNT(*) FILTER (WHERE s.created_at < DATE_TRUNC('month', s.updated_at)), 0),
          2
        ) as churn_rate_pct
      FROM subscriptions s
      WHERE s.status = 'cancelled'
        AND s.tenant_id = ${tenantId}
        AND s.updated_at > CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', s.updated_at)
      ORDER BY churn_month DESC
      LIMIT 1
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      value: parseFloat(row.churn_rate_pct || 0),
      churned: parseInt(row.churned_subscriptions) || 0,
      activeAtStart: parseInt(row.active_at_start) || 0,
      period: new Date(row.churn_month).toISOString().split('T')[0],
      warning: 'Imprecise metric - uses updated_at as proxy for cancellation date.',
    };
  }

  private async getROAS(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        ROUND(AVG(CASE
          WHEN (c.metrics->>'spend')::NUMERIC IS NULL OR (c.metrics->>'spend')::NUMERIC = 0 THEN NULL
          WHEN (c.metrics->>'revenue')::NUMERIC IS NULL THEN NULL
          ELSE ((c.metrics->>'revenue')::NUMERIC / (c.metrics->>'spend')::NUMERIC)
        END), 2) as avg_roas,
        SUM((c.metrics->>'spend')::NUMERIC) as total_spend,
        SUM((c.metrics->>'revenue')::NUMERIC) as total_revenue,
        COUNT(*) as campaigns_analyzed
      FROM campaigns c
      WHERE c.status IN ('active', 'paused')
        AND c.tenant_id = ${tenantId}
        AND c.metrics ? 'spend'
        AND c.metrics ? 'revenue'
        AND (c.metrics->>'spend')::NUMERIC > 0
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      value: parseFloat(row.avg_roas || 0),
      spend: parseFloat(row.total_spend || 0),
      revenue: parseFloat(row.total_revenue || 0),
      campaignsAnalyzed: parseInt(row.campaigns_analyzed) || 0,
      warning: 'May be stale - no update timestamp. Metrics synced via Meta webhook.',
    };
  }

  // ==================== TECHNICAL KPIs ====================

  private async getTechnicalKPIs(params: KPIQueryParams): Promise<TechnicalKPI> {
    const result: TechnicalKPI = {};

    try {
      result.activeCampaigns = await this.getActiveCampaigns(params);
    } catch (err) {
      console.error('Active Campaigns error:', err);
    }

    try {
      result.latency = await this.getLatency(params);
    } catch (err) {
      console.error('Latency error:', err);
    }

    try {
      result.errorRate = await this.getErrorRate(params);
    } catch (err) {
      console.error('Error Rate error:', err);
    }

    try {
      result.rps = await this.getRPS(params);
    } catch (err) {
      console.error('RPS error:', err);
    }

    try {
      result.slowEndpoints = await this.getSlowEndpoints(params);
    } catch (err) {
      console.error('Slow Endpoints error:', err);
    }

    return result;
  }

  private async getActiveCampaigns(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        COUNT(*) as active_campaigns_total,
        MIN(created_at) as oldest_active_campaign,
        MAX(created_at) as newest_active_campaign
      FROM campaigns
      WHERE status = 'active'
        AND tenant_id = ${tenantId}
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      value: parseInt(row.active_campaigns_total) || 0,
      byTenant: {}, // Could be enhanced to show per-tenant breakdown
      timestamp: new Date().toISOString(),
    };
  }

  private async getLatency(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY rl.response_time_ms) as p50_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.response_time_ms) as p95_ms,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY rl.response_time_ms) as p99_ms,
        AVG(rl.response_time_ms)::INT as avg_ms,
        MIN(rl.response_time_ms) as min_ms,
        MAX(rl.response_time_ms) as max_ms,
        COUNT(*) as sample_count
      FROM request_logs rl
      WHERE rl.tenant_id = ${tenantId}
        AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      p50Ms: parseFloat(row.p50_ms) || 0,
      p95Ms: parseFloat(row.p95_ms) || 0,
      p99Ms: parseFloat(row.p99_ms) || 0,
      avgMs: parseInt(row.avg_ms) || 0,
      maxMs: parseInt(row.max_ms) || 0,
      sampleSize: parseInt(row.sample_count) || 0,
      period: 'last_24h',
    };
  }

  private async getErrorRate(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE rl.status_code >= 400 AND rl.status_code < 500) as errors_4xx,
        COUNT(*) FILTER (WHERE rl.status_code >= 500) as errors_5xx,
        CASE
          WHEN COUNT(*) = 0 THEN NULL
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE rl.status_code >= 400) / COUNT(*), 2)
        END as error_rate_pct,
        CASE
          WHEN COUNT(*) = 0 THEN NULL
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE rl.status_code >= 400 AND rl.status_code < 500) / COUNT(*), 2)
        END as error_4xx_pct,
        CASE
          WHEN COUNT(*) = 0 THEN NULL
          ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE rl.status_code >= 500) / COUNT(*), 2)
        END as error_5xx_pct
      FROM request_logs rl
      WHERE rl.tenant_id = ${tenantId}
        AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      value: parseFloat(row.error_rate_pct || 0),
      total4xx: parseInt(row.errors_4xx) || 0,
      total5xx: parseInt(row.errors_5xx) || 0,
      totalRequests: parseInt(row.total_requests) || 0,
      errorRate4xxPct: parseFloat(row.error_4xx_pct || 0),
      errorRate5xxPct: parseFloat(row.error_5xx_pct || 0),
      period: 'last_24h',
    };
  }

  private async getRPS(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        COUNT(*) as request_count,
        ROUND(COUNT(*) / 60.0, 2) as rps,
        DATE_TRUNC('minute', CURRENT_TIMESTAMP) as current_minute
      FROM request_logs rl
      WHERE rl.tenant_id = ${tenantId}
        AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '1 minute'
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      value: parseFloat(row.rps) || 0,
      totalRequests: parseInt(row.request_count) || 0,
      period: 'last_minute',
    };
  }

  private async getSlowEndpoints(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        COALESCE(rl.path_template, rl.path) as endpoint,
        rl.method,
        COUNT(*) as request_count,
        AVG(rl.response_time_ms)::INT as avg_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.response_time_ms) as p95_ms,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY rl.response_time_ms) as p99_ms,
        MAX(rl.response_time_ms) as max_ms,
        COUNT(*) FILTER (WHERE rl.status_code >= 500) as error_count
      FROM request_logs rl
      WHERE rl.tenant_id = ${tenantId}
        AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      GROUP BY COALESCE(rl.path_template, rl.path), rl.method
      HAVING COUNT(*) >= 50
      ORDER BY avg_ms DESC
      LIMIT 20
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    return {
      endpoints: result.map(row => ({
        endpoint: row.endpoint,
        method: row.method,
        requestCount: parseInt(row.request_count),
        avgResponseTimeMs: parseInt(row.avg_ms),
        p95ResponseTimeMs: parseFloat(row.p95_ms),
        maxResponseTimeMs: parseInt(row.max_ms),
      })),
      period: 'last_7d',
      warning: 'path_template may be NULL for some requests.',
    };
  }

  // ==================== ENGAGEMENT KPIs ====================

  private async getEngagementKPIs(params: KPIQueryParams): Promise<EngagementKPI> {
    const result: EngagementKPI = {};

    try {
      result.activeTenants24h = await this.getActiveTenants24h(params);
    } catch (err) {
      console.error('Active Tenants 24h error:', err);
    }

    try {
      result.automations = await this.getAutomations(params);
    } catch (err) {
      console.error('Automations error:', err);
    }

    try {
      result.creatives = await this.getCreatives(params);
    } catch (err) {
      console.error('Creatives error:', err);
    }

    return result;
  }

  private async getActiveTenants24h(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        COUNT(DISTINCT rl.user_id) as active_users_24h,
        COUNT(*) as total_requests
      FROM request_logs rl
      WHERE rl.tenant_id = ${tenantId}
        AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      value: parseInt(row.active_users_24h) || 0,
      timestamp: new Date().toISOString(),
    };
  }

  private async getAutomations(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        (SELECT COUNT(*) FROM automation_rules WHERE tenant_id = ${tenantId} AND DATE_TRUNC('day', created_at) = CURRENT_DATE) as created_today,
        (SELECT COUNT(*) FROM automation_rules WHERE tenant_id = ${tenantId} AND is_active = true) as active_rules,
        (SELECT COUNT(*) FROM rule_executions WHERE DATE_TRUNC('day', triggered_at) = CURRENT_DATE) as executions_today
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      createdToday: parseInt(row.created_today) || 0,
      activeRules: parseInt(row.active_rules) || 0,
      executionsToday: parseInt(row.executions_today) || 0,
      date: new Date().toISOString().split('T')[0],
    };
  }

  private async getCreatives(params: KPIQueryParams) {
    const tenantId = params.tenantId;
    const query = sql`
      SELECT
        COUNT(*) as total_generated,
        COUNT(*) FILTER (WHERE compliance_status = 'approved') as approved,
        COUNT(*) FILTER (WHERE compliance_status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE compliance_status = 'pending_compliance') as pending
      FROM creative_assets
      WHERE tenant_id = ${tenantId}
        AND DATE_TRUNC('day', created_at) = CURRENT_DATE
    `;

    const result = await this.executeQuery<any>(query);
    if (result.length === 0) {
      return undefined;
    }

    const row = result[0];
    return {
      generatedToday: parseInt(row.total_generated) || 0,
      byComplianceStatus: {
        approved: parseInt(row.approved) || 0,
        rejected: parseInt(row.rejected) || 0,
        pending: parseInt(row.pending) || 0,
      },
      date: new Date().toISOString().split('T')[0],
    };
  }

  // ==================== UTILITY METHODS ====================

  private async executeQuery<T>(query: ReturnType<typeof sql>): Promise<T[]> {
    return db.execute(query) as Promise<T[]>;
  }
}
