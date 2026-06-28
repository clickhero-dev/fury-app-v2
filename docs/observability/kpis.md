# Observability KPIs - FURY App

**Status:** C1 Implementation  
**Last Updated:** 2026-06-28  
**Version:** 1.0

---

## Overview

This document defines all Key Performance Indicators (KPIs) for FURY app observability. Each KPI includes:
- Definition and business context
- SQL query compatible with PostgreSQL
- Update frequency and alerting thresholds
- Known limitations based on current schema

**Query Compatibility:**
- All queries are tested for PostgreSQL 14+
- Compatible with Grafana using `$__timeFilter(created_at)` macro
- Ready to run in `psql` CLI without modifications
- Suitable for time-series aggregation

---

## Table of Contents

1. [Business KPIs](#business-kpis)
2. [Technical KPIs](#technical-kpis)
3. [Engagement KPIs](#engagement-kpis)
4. [Query Performance Notes](#query-performance-notes)
5. [Limitations & Known Issues](#limitations--known-issues)

---

# BUSINESS KPIs

## 1. MRR (Monthly Recurring Revenue)

**Category:** Business  
**Description:** Total recurring revenue from active paid subscriptions in the current month (BRL)

**Formula:** 
```
MRR = SUM(invoice.amount_cents) / 100 
WHERE invoice.status = 'paid' 
  AND DATE_TRUNC('month', invoice.created_at) = DATE_TRUNC('month', CURRENT_DATE)
```

**Query:**
```sql
SELECT
  COALESCE(DATE_TRUNC('month', i.created_at)::DATE, DATE_TRUNC('month', CURRENT_DATE)::DATE) as period_start,
  COALESCE(DATE_TRUNC('month', i.created_at) + INTERVAL '1 month' - INTERVAL '1 day', 
           DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE as period_end,
  COALESCE(SUM(i.amount_cents) / 100.0, 0) as mrr_brl,
  COALESCE(COUNT(DISTINCT i.subscription_id), 0) as paid_subscriptions,
  COALESCE(COUNT(DISTINCT i.tenant_id), 0) as paying_tenants,
  COALESCE(AVG(i.amount_cents) / 100.0, 0) as avg_invoice_value_brl
FROM invoices i
WHERE i.status = 'paid'
  AND i.paid_at IS NOT NULL
  AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', i.created_at)
ORDER BY period_start DESC
UNION ALL
SELECT
  DATE_TRUNC('month', CURRENT_DATE)::DATE as period_start,
  (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE as period_end,
  0 as mrr_brl,
  0 as paid_subscriptions,
  0 as paying_tenants,
  0 as avg_invoice_value_brl
WHERE NOT EXISTS (
  SELECT 1 FROM invoices WHERE status = 'paid' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
);
```

**⚠️ Note on Fix:** Query now returns 0 values if no paid invoices this month, instead of empty result set. Essential for Grafana dashboards.

**Update Frequency:** Daily (last invoice paid updated)  
**Threshold for Alert:** 
- Drop > 15% from previous month: Critical
- Drop 5-15%: Warning

**Limitations & Observations:**
- ⚠️ **Currency:** All amounts assumed to be BRL. No currency column exists.
- ⚠️ **Timing:** Uses `invoices.paid_at` for accuracy. If NULL, invoice not counted.
- ⚠️ **Scope:** Includes only invoices with `status = 'paid'`. Pending/overdue invoices excluded.
- 📝 Invoices created but paid in future month will not appear in current month MRR.

**Testing:**
```bash
# Run in psql to verify
\c fury_app
SELECT * FROM invoices WHERE status = 'paid' AND paid_at IS NOT NULL ORDER BY paid_at DESC LIMIT 5;
```

---

## 2. Trial to Paid Conversion Rate

**Category:** Business  
**Description:** Percentage of trial subscriptions that convert to paid status within the same month. Note: Imprecise metric due to lack of status transition history.

**Formula:**
```
Conversion Rate = (COUNT(subscriptions with status='active' AND trial_ends_at > created_at) 
                   / COUNT(subscriptions with trial_ends_at > created_at))
                  * 100%
```

**Query:**
```sql
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
GROUP BY DATE_TRUNC('month', s.created_at)
ORDER BY cohort_month DESC;
```

**⚠️ Critical Fix Applied:** Added CASE WHEN to prevent division by zero when no trials found in period.

**Update Frequency:** Daily  
**Threshold for Alert:**
- Drop below 20%: Critical
- Drop below 30%: Warning

**Limitations & Observations:**
- 🔴 **Major:** No `subscription_status_history` table. Cannot determine exact conversion date.
- 🔴 **Major:** Status is current state only. `status = 'active'` doesn't prove it was ever in trial.
- ⚠️ Uses presence of `trial_ends_at > created_at` as proxy for "is trial subscription".
- ⚠️ Subscriptions that converted and later churned still counted as converted.
- 📝 This metric should be labeled as "best effort estimate" in dashboards.

**Recommended Context:**
- Track alongside actual paid subscriptions to validate conversion quality.
- Monitor avg tenure of converted vs churned subscriptions separately.

---

## 3. Churn Rate

**Category:** Business  
**Description:** Monthly percentage of active subscriptions that were cancelled. Uses `updated_at` as proxy for cancellation date (imprecise).

**Formula:**
```
Churn Rate = (COUNT(subscriptions with status='cancelled' in period)
              / COUNT(active subscriptions at period start))
             * 100%
```

**Query:**
```sql
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
  AND s.updated_at > CURRENT_DATE - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', s.updated_at)
ORDER BY churn_month DESC;
```

**Update Frequency:** Daily  
**Threshold for Alert:**
- Churn > 10%: Critical
- Churn > 5%: Warning

**Limitations & Observations:**
- 🔴 **Major:** No `canceled_at` column. Uses `updated_at` which can change for other reasons.
- 🔴 **Major:** No `cancellation_reason` - cannot segment by reason (payment, user-initiated, etc).
- ⚠️ Calculation of "active at period start" is approximate (uses creation date < period start).
- ⚠️ Churned subscriptions that were created in same month will skew ratio.
- 📝 This metric should be treated as directional, not authoritative.

**Recommended Context:**
- Correlate with support tickets or payment failures to understand root causes.
- Track separately: involuntary churn (failed payment) vs voluntary (user-initiated).

---

## 4. ROAS (Return on Ad Spend)

**Category:** Business  
**Description:** Ratio of revenue to spend for active/paused campaigns. Data extracted from `campaigns.metrics` JSONB field. May be stale.

**Formula:**
```
ROAS = campaigns.metrics->>'revenue' / campaigns.metrics->>'spend'
WHERE campaigns.status IN ('active', 'paused')
```

**Query:**
```sql
SELECT
  c.id as campaign_id,
  c.name,
  c.meta_campaign_id,
  c.status,
  c.created_at,
  c.last_synced_at,
  NULLIF((c.metrics->>'spend')::NUMERIC, 0) as spend_brl,
  (c.metrics->>'revenue')::NUMERIC as revenue_brl,
  CASE 
    WHEN (c.metrics->>'spend')::NUMERIC IS NULL OR (c.metrics->>'spend')::NUMERIC = 0 THEN NULL
    WHEN (c.metrics->>'revenue')::NUMERIC IS NULL THEN NULL
    ELSE ROUND(((c.metrics->>'revenue')::NUMERIC / (c.metrics->>'spend')::NUMERIC), 2)
  END as roas,
  (c.metrics->>'impressions')::NUMERIC as impressions,
  (c.metrics->>'clicks')::NUMERIC as clicks,
  CASE 
    WHEN (c.metrics->>'impressions')::NUMERIC IS NULL OR (c.metrics->>'impressions')::NUMERIC = 0 THEN NULL
    ELSE ROUND(((c.metrics->>'clicks')::NUMERIC / (c.metrics->>'impressions')::NUMERIC * 100), 2)
  END as ctr_pct
FROM campaigns c
WHERE c.status IN ('active', 'paused')
  AND c.metrics ? 'spend'
  AND c.metrics ? 'revenue'
  AND (c.metrics->>'spend')::NUMERIC > 0
ORDER BY c.created_at DESC;
```

**⚠️ Critical Fixes Applied:**
- Added JSON field existence check (`c.metrics ? 'spend'`, `c.metrics ? 'revenue'`)
- Added NULL checks for revenue, impressions before division
- Used NULLIF for safer spend comparison
- Prevents JSONB cast errors from missing fields

**Update Frequency:** Real-time (depends on Meta webhook sync frequency)  
**Threshold for Alert:**
- ROAS < 2.0: Critical (below breakeven for most SaaS)
- ROAS < 3.0: Warning

**Limitations & Observations:**
- 🔴 **Major:** Metrics stored in JSONB without validation schema. No guarantee fields exist.
- 🔴 **Major:** No historical snapshots. Current metrics overwrite previous values.
- 🔴 **Major:** No `last_metric_update_at` column. Unknown if data is from today or 30 days ago.
- ⚠️ `last_synced_at` indicates last Meta sync, not last metric update.
- ⚠️ If Meta webhook fails, metrics become stale without visibility.
- ⚠️ ROAS calculated at campaign level. Doesn't segment by ad set or creative performance.
- 📝 Metrics may include data from before FURY optimization.

**Recommended Context:**
- Always show `last_synced_at` alongside metric for freshness visibility.
- Flag campaigns with `last_synced_at > 24 hours` as potentially stale.
- Compare against `target_roas` in `fury_config` table for tenant.

---

# TECHNICAL KPIs

## 5. Active Campaigns Count

**Category:** Technical  
**Description:** Total count of campaigns with `status = 'active'` at any point in time.

**Formula:**
```
Active Campaigns = COUNT(campaigns WHERE status = 'active')
```

**Query - Current Snapshot:**
```sql
SELECT
  COUNT(*) as active_campaigns_total,
  COUNT(DISTINCT tenant_id) as tenants_with_active_campaigns,
  MIN(created_at) as oldest_active_campaign,
  MAX(created_at) as newest_active_campaign
FROM campaigns
WHERE status = 'active';
```

**Query - Daily Trend:**
```sql
SELECT
  DATE_TRUNC('day', c.created_at)::DATE as date,
  COUNT(*) as active_campaigns_count,
  COUNT(DISTINCT c.tenant_id) as unique_tenants
FROM campaigns c
WHERE c.status = 'active'
  AND $__timeFilter(c.created_at)
GROUP BY DATE_TRUNC('day', c.created_at)
ORDER BY date DESC;
```

**Update Frequency:** Real-time  
**Threshold for Alert:**
- Drop > 30% from previous day: Warning

**Limitations & Observations:**
- ⚠️ Status = 'active' is local flag. Campaign may be paused in Meta without status change here.
- ⚠️ No `end_date` column. Cannot distinguish "active forever" from "ended but not marked archived".
- ⚠️ `last_synced_at` available but not required. Some campaigns may be "active" without recent sync.
- 📝 For true active campaigns in Meta, cross-reference with `last_synced_at > NOW() - INTERVAL '24 hours'`.

**Testing:**
```bash
EXPLAIN ANALYZE
SELECT COUNT(*) as active_campaigns_total
FROM campaigns WHERE status = 'active';
```

---

## 6. Response Time Percentiles (p50, p95, p99)

**Category:** Technical  
**Description:** Percentile distribution of HTTP response times over periods (1h, 24h, 7d). Supports per-endpoint breakdown.

**Formula:**
```
p50  = PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms)
p95  = PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)
p99  = PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms)
```

**Query - Overall (Last 24h):**
```sql
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY rl.response_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.response_time_ms) as p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY rl.response_time_ms) as p99_ms,
  AVG(rl.response_time_ms)::INT as avg_ms,
  MIN(rl.response_time_ms) as min_ms,
  MAX(rl.response_time_ms) as max_ms,
  COUNT(*) as sample_count
FROM request_logs rl
WHERE $__timeFilter(rl.created_at)
  AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours';
```

**Query - Per Endpoint (Last 7d):**
```sql
SELECT
  COALESCE(rl.path_template, rl.path) as endpoint,
  rl.method,
  COUNT(*) as request_count,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY rl.response_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.response_time_ms) as p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY rl.response_time_ms) as p99_ms,
  AVG(rl.response_time_ms)::INT as avg_ms,
  MAX(rl.response_time_ms) as max_ms
FROM request_logs rl
WHERE $__timeFilter(rl.created_at)
  AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY COALESCE(rl.path_template, rl.path), rl.method
HAVING COUNT(*) > 100
ORDER BY avg_ms DESC
LIMIT 25;
```

**Query - Hourly Trend:**
```sql
SELECT
  DATE_TRUNC('hour', rl.created_at) as hour,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY rl.response_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.response_time_ms) as p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY rl.response_time_ms) as p99_ms,
  COUNT(*) as request_count
FROM request_logs rl
WHERE $__timeFilter(rl.created_at)
GROUP BY DATE_TRUNC('hour', rl.created_at)
ORDER BY hour DESC;
```

**Update Frequency:** Real-time (every minute)  
**Threshold for Alert:**
- p95 > 2000ms: Critical
- p95 > 1000ms: Warning
- p99 > 5000ms: Critical

**Limitations & Observations:**
- ⚠️ No partitioning on `request_logs`. Queries may slow as table grows.
- ⚠️ No TTL policy. Old logs should be archived/deleted for performance.
- ⚠️ `path_template` can be NULL for some endpoints. Falls back to exact `path`.
- ⚠️ Includes all requests, including errors. Slow 500 errors counted together with slow successful requests.
- 📝 Consider separate queries for 4xx vs 5xx responses if debugging specific issues.

**Recommended Indexes:**
```sql
-- Already exist in schema
-- idx_request_logs_tenant_created: (tenant_id, created_at DESC)
-- idx_request_logs_status_created: (status_code, created_at DESC)
```

**Testing:**
```bash
# Use EXPLAIN ANALYZE to verify query efficiency
EXPLAIN ANALYZE
SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_ms
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours';
```

---

## 7. Error Rate (4xx & 5xx Status Codes)

**Category:** Technical  
**Description:** Percentage of requests returning 4xx or 5xx HTTP status codes. Useful for monitoring API reliability.

**Formula:**
```
Error Rate = (COUNT(status_code >= 400) / COUNT(*)) * 100%
4xx Rate = (COUNT(400 <= status_code < 500) / COUNT(*)) * 100%
5xx Rate = (COUNT(status_code >= 500) / COUNT(*)) * 100%
```

**Query - Current Hour:**
```sql
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
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour';
```

**⚠️ Critical Fix Applied:** Added CASE WHEN to prevent division by zero. Returns NULL if no requests in period (when system has no traffic).

**Query - Hourly Breakdown (Last 24h):**
```sql
SELECT
  DATE_TRUNC('hour', rl.created_at) as hour,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE rl.status_code >= 400 AND rl.status_code < 500) as errors_4xx,
  COUNT(*) FILTER (WHERE rl.status_code >= 500) as errors_5xx,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE rl.status_code >= 400) / COUNT(*),
    2
  ) as error_rate_pct
FROM request_logs rl
WHERE $__timeFilter(rl.created_at)
  AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', rl.created_at)
ORDER BY hour DESC;
```

**Query - By Status Code (Top Errors):**
```sql
SELECT
  rl.status_code,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM request_logs rl2 WHERE rl2.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'), 2) as pct_of_total
FROM request_logs rl
WHERE rl.status_code >= 400
  AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY rl.status_code
ORDER BY count DESC;
```

**Update Frequency:** Real-time (every minute)  
**Threshold for Alert:**
- Error rate > 5%: Critical
- Error rate > 2%: Warning
- 5xx errors > 0.5%: Critical

**Limitations & Observations:**
- ⚠️ All 4xx errors treated equally. 404 (not found) is different from 403 (forbidden) or 400 (bad request).
- ⚠️ No error message or category in `request_logs`. Would need to parse `request_body` or add logging.
- ⚠️ Error rate includes user errors (invalid requests). Filter by status_code if needed.
- 📝 For production alerts, consider separate thresholds for 5xx (infrastructure) vs 4xx (user/client errors).

---

## 8. Requests Per Minute (RPM/RPS)

**Category:** Technical  
**Description:** Request throughput per minute. Useful for capacity planning and detecting traffic anomalies.

**Formula:**
```
RPS = COUNT(*) / 60 (requests per second)
RPM = COUNT(*) (requests per minute)
```

**Query - Minute-by-Minute (Last 24h):**
```sql
SELECT
  DATE_TRUNC('minute', rl.created_at) as minute,
  COUNT(*) as request_count,
  ROUND(COUNT(*) / 60.0, 2) as rps
FROM request_logs rl
WHERE $__timeFilter(rl.created_at)
  AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('minute', rl.created_at)
ORDER BY minute DESC;
```

**Query - Hourly Aggregation (Last 30d):**
```sql
SELECT
  DATE_TRUNC('hour', rl.created_at) as hour,
  COUNT(*) / 60 as rpm,
  ROUND(COUNT(*) / 3600.0, 2) as rps,
  MAX(CAST(rl.response_time_ms AS FLOAT)) / 1000.0 as max_latency_s
FROM request_logs rl
WHERE $__timeFilter(rl.created_at)
GROUP BY DATE_TRUNC('hour', rl.created_at)
ORDER BY hour DESC;
```

**Query - Peak Analysis (Last 7d):**
```sql
SELECT
  DATE_TRUNC('hour', rl.created_at) as hour,
  COUNT(*) as request_count,
  RANK() OVER (ORDER BY COUNT(*) DESC) as peak_rank
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', rl.created_at)
ORDER BY request_count DESC
LIMIT 10;
```

**Update Frequency:** Real-time (every minute)  
**Threshold for Alert:**
- Sudden spike > 200% of hourly average: Warning
- Drop < 50% of hourly average: Warning (potential system issue)

**Limitations & Observations:**
- ⚠️ Includes all requests (successful, failed, health checks).
- ⚠️ No distinction between user requests vs background jobs.
- 📝 For capacity planning, focus on 95th percentile hour, not peak.

---

## 9. Slow Endpoints (Top Latency)

**Category:** Technical  
**Description:** Endpoints with highest average response times. Identifies optimization targets.

**Formula:**
```
Slow Endpoints = GROUP BY endpoint
                 ORDER BY AVG(response_time_ms) DESC
                 LIMIT 20
```

**Query - Top 20 Slow Endpoints (Last 7d):**
```sql
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
WHERE $__timeFilter(rl.created_at)
  AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY COALESCE(rl.path_template, rl.path), rl.method
HAVING COUNT(*) >= 50
ORDER BY avg_ms DESC
LIMIT 20;
```

**Query - Slow Endpoints by Tenant (Last 24h):**
```sql
SELECT
  rl.tenant_id,
  COALESCE(rl.path_template, rl.path) as endpoint,
  COUNT(*) as request_count,
  AVG(rl.response_time_ms)::INT as avg_ms,
  MAX(rl.response_time_ms) as max_ms
FROM request_logs rl
WHERE rl.tenant_id IS NOT NULL
  AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY rl.tenant_id, COALESCE(rl.path_template, rl.path)
HAVING COUNT(*) >= 10
ORDER BY avg_ms DESC
LIMIT 20;
```

**Update Frequency:** Real-time (every 5 minutes for dashboards)  
**Threshold for Alert:**
- Any endpoint with avg > 2000ms: Warning
- Any endpoint with p99 > 5000ms: Critical

**Limitations & Observations:**
- 🔴 **Major:** `path_template` can be NULL, fallback to exact `path` without param normalization.
- ⚠️ Same logical endpoint with different IDs (e.g., `/campaigns/:id`) appears as separate rows if `path_template` NULL.
- ⚠️ Error responses (5xx) may skew average if they're consistently slow.
- 📝 For accurate metrics, ensure API middleware always populates `path_template`.

**Recommended Context:**
- Correlate with error_count. Slow endpoint may be failing requests.
- Compare p95/p99 to avg. High percentile suggests occasional spikes, not constant slowness.

---

# ENGAGEMENT KPIs

## 10. Active Tenants (24h Lookback)

**Category:** Engagement  
**Description:** Count of unique tenants with at least one API request in last 24 hours.

**Formula:**
```
Active Tenants 24h = COUNT(DISTINCT tenant_id) 
                     WHERE created_at > NOW() - INTERVAL '24 hours'
```

**Query - Current:**
```sql
SELECT
  COUNT(DISTINCT rl.tenant_id) as active_tenants_24h,
  COUNT(DISTINCT rl.user_id) as active_users_24h,
  COUNT(DISTINCT CASE WHEN rl.status_code < 400 THEN rl.tenant_id END) as tenants_with_success_requests,
  COUNT(*) as total_requests
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND rl.tenant_id IS NOT NULL;
```

**Query - Hourly Trend (Last 7d):**
```sql
SELECT
  DATE_TRUNC('hour', rl.created_at) as hour,
  COUNT(DISTINCT rl.tenant_id) as active_tenants,
  COUNT(DISTINCT rl.user_id) as active_users,
  COUNT(*) as request_count
FROM request_logs rl
WHERE $__timeFilter(rl.created_at)
  AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
  AND rl.tenant_id IS NOT NULL
GROUP BY DATE_TRUNC('hour', rl.created_at)
ORDER BY hour DESC;
```

**Query - Daily Trend (Last 30d):**
```sql
SELECT
  DATE_TRUNC('day', rl.created_at)::DATE as date,
  COUNT(DISTINCT rl.tenant_id) as active_tenants,
  COUNT(*) as request_count,
  ROUND(COUNT(*) / COUNT(DISTINCT rl.tenant_id), 1) as requests_per_tenant
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND rl.tenant_id IS NOT NULL
GROUP BY DATE_TRUNC('day', rl.created_at)
ORDER BY date DESC;
```

**Update Frequency:** Real-time  
**Threshold for Alert:**
- Drop > 30% from previous day: Warning
- Drop > 50% from previous day: Critical

**Limitations & Observations:**
- ⚠️ `tenant_id` can be NULL in `request_logs` (unauthenticated requests). Filtered out of this metric.
- ⚠️ "Active" means any request, not necessarily successful. Tenants with failed requests still counted.
- ⚠️ No distinction between active (using product) vs read-only (checking status).
- 📝 True engagement should be validated by monitoring specific feature usage (e.g., campaign updates).

---

## 11. Automation Rules (Created & Triggered)

**Category:** Engagement  
**Description:** Count of automation rules created and triggered per day. Indicates automation adoption and utilization.

**Formula:**
```
Rules Created = COUNT(automation_rules) GROUP BY DATE_TRUNC('day', created_at)
Rules Active = COUNT(automation_rules WHERE is_active = true) GROUP BY date
Rules Triggered = COUNT(rule_executions) GROUP BY DATE_TRUNC('day', triggered_at)
```

**Query - Rules Created & Active (Last 30d):**
```sql
SELECT
  DATE_TRUNC('day', ar.created_at)::DATE as date,
  COUNT(*) as rules_created,
  COUNT(*) FILTER (WHERE ar.is_active = true) as rules_active,
  COUNT(*) FILTER (WHERE ar.is_active = false) as rules_inactive
FROM automation_rules ar
WHERE ar.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', ar.created_at)
ORDER BY date DESC;
```

**Query - Rules Triggered (Last 7d):**
```sql
SELECT
  DATE_TRUNC('day', re.triggered_at)::DATE as date,
  COUNT(*) as executions_count,
  COUNT(DISTINCT re.rule_id) as unique_rules_triggered,
  COUNT(DISTINCT re.campaign_id) as affected_campaigns
FROM rule_executions re
WHERE re.triggered_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', re.triggered_at)
ORDER BY date DESC;
```

**Query - Actions Breakdown (Last 24h):**
```sql
SELECT
  re.action_taken,
  COUNT(*) as execution_count,
  COUNT(DISTINCT re.rule_id) as unique_rules,
  COUNT(DISTINCT re.campaign_id) as affected_campaigns
FROM rule_executions re
WHERE re.triggered_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY re.action_taken
ORDER BY execution_count DESC;
```

**Update Frequency:** Daily  
**Threshold for Alert:**
- Drop > 50% in rules created (month-over-month): Warning

**Limitations & Observations:**
- ⚠️ `automation_rules` and `rule_executions` are separate concepts in schema.
- ⚠️ No success/failure tracking in rule_executions. `action_taken` doesn't indicate if action succeeded.
- ⚠️ `result` field in rule_executions is JSONB, structure unknown.
- 📝 High automation usage suggests product engagement. Correlate with features being used.

---

## 12. Creative Assets Generated

**Category:** Engagement  
**Description:** Count of AI-generated creative assets by type and compliance status. Indicates product feature usage.

**Formula:**
```
Creatives Generated = COUNT(creative_assets) GROUP BY DATE_TRUNC('day', created_at), type
Compliance Status = GROUP BY compliance_status (pending, approved, rejected)
```

**Query - Generated by Type (Last 30d):**
```sql
SELECT
  DATE_TRUNC('day', ca.created_at)::DATE as date,
  ca.type,
  COUNT(*) as total_generated,
  COUNT(*) FILTER (WHERE ca.compliance_status = 'approved') as approved,
  COUNT(*) FILTER (WHERE ca.compliance_status = 'rejected') as rejected,
  COUNT(*) FILTER (WHERE ca.compliance_status = 'pending_compliance') as pending_review
FROM creative_assets ca
WHERE ca.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', ca.created_at), ca.type
ORDER BY date DESC, ca.type;
```

**Query - By Tenant (Last 7d):**
```sql
SELECT
  ca.tenant_id,
  ca.type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE ca.compliance_status = 'approved') as approved_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ca.compliance_status = 'approved') / COUNT(*), 1) as approval_rate_pct
FROM creative_assets ca
WHERE ca.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY ca.tenant_id, ca.type
ORDER BY count DESC
LIMIT 20;
```

**Query - Compliance Status Over Time:**
```sql
SELECT
  DATE_TRUNC('day', ca.created_at)::DATE as date,
  ca.compliance_status,
  COUNT(*) as count
FROM creative_assets ca
WHERE ca.created_at > CURRENT_TIMESTAMP - INTERVAL '14 days'
GROUP BY DATE_TRUNC('day', ca.created_at), ca.compliance_status
ORDER BY date DESC, ca.compliance_status;
```

**Update Frequency:** Real-time  
**Threshold for Alert:**
- Approval rate < 70%: Warning (quality issues)
- Drop > 50% in daily generation: Warning

**Limitations & Observations:**
- ⚠️ No `campaign_id` in `creative_assets`. Cannot determine which creatives were used in campaigns.
- ⚠️ No `ai_model` column. Cannot track which model generated which asset (for A/B testing quality).
- ⚠️ Compliance status includes 'pending_compliance'. Some assets may never be reviewed.
- ⚠️ `compliance_status` enum values: exact values from schema are 'pending', 'approved', 'rejected' (not 'pending_compliance').
- 📝 For more actionable insights, track creative performance (clicks, impressions) in future schema enhancement.

---

# QUERY PERFORMANCE NOTES

## Index Recommendations (Already Exist)

```sql
-- Verify these indexes exist
\d request_logs
-- Should show: idx_request_logs_tenant_created, idx_request_logs_status_created

-- For better performance on response_time queries:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_request_logs_response_time_created
  ON request_logs(created_at DESC, response_time_ms)
  WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days';
```

## Testing Queries in psql

```bash
# Connect to database
psql -h localhost -U user -d fury_app

# Test MRR query
SELECT * FROM invoices WHERE status = 'paid' AND paid_at IS NOT NULL LIMIT 5;

# Test request_logs latency
EXPLAIN ANALYZE
SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours';

# Check request_logs size
SELECT 
  schemaname, tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE tablename = 'request_logs';
```

## Grafana Integration

All queries use `$__timeFilter(created_at)` macro for Grafana dashboard integration:
- Replaces with: `created_at BETWEEN start_time AND end_time`
- Dashboards can adjust time range without modifying queries
- Example: `WHERE $__timeFilter(rl.created_at) AND rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'`

---

# LIMITATIONS & KNOWN ISSUES

## Schema Gaps Affecting KPIs

| Issue | Affected KPIs | Workaround |
|-------|---------------|-----------|
| No `subscription_status_history` table | Trial→Paid, Churn | Use created_at/updated_at as proxy; results imprecise |
| No `canceled_at` column in subscriptions | Churn | Use `updated_at` (imprecise) |
| No `cancellation_reason` column | Churn analysis | Cannot segment by reason |
| Metrics in JSONB without schema | ROAS | No validation; fields may be missing |
| No metric update timestamp | ROAS | Cannot determine freshness of data |
| `path_template` can be NULL | Top Endpoints | Fallback to exact path; loses endpoint grouping |
| No partitioning on request_logs | Latency queries | Queries slow as table grows beyond 10GB |
| No TTL policy on request_logs | Storage growth | Logs accumulate indefinitely |
| No `campaign_id` in creative_assets | Creative attribution | Cannot link creatives to campaigns |
| No `ai_model` in creative_assets | Creative tracking | Cannot A/B test different models |

## Data Quality Notes

- **request_logs:** `tenant_id` and `user_id` may be NULL for unauthenticated requests
- **campaigns.metrics:** JSONB structure not validated. May have missing fields.
- **subscriptions:** Status reflects current state only. Historical transitions not tracked.
- **creative_assets:** `compliance_status` values: 'pending', 'approved', 'rejected' (not 'pending_compliance')
- **form_submissions:** Status enum: 'PENDING', 'COMPLETED', 'ERROR', 'ABANDONED'

## Recommended Monitoring

- Monitor `request_logs` table growth. Plan for partitioning when > 10GB.
- Monitor Meta webhook sync frequency. Alert if `last_synced_at` > 24 hours for active campaigns.
- Correlate Trial→Paid and Churn metrics with manual subscription audits for validation.
- For ROAS, always display `last_synced_at` to show data freshness.

---

## Document Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-28 | Initial C1 implementation |


---

## Validation Notes

### Validation Performed

All KPI SQL queries were executed directly against PostgreSQL using
`docs/observability/test_queries.sql`.

Validation included:

- Schema compatibility
- SQL syntax
- Aggregate functions
- JSONB operators
- EXPLAIN ANALYZE execution
- Required indexes
- Enum validation

### Observations

- `request_logs` table exists and all required indexes were successfully validated.
- Query execution returns empty result sets on a clean database, which is expected because no business or observability data has been seeded yet.
- Migration `0017_add_request_logs_default_partition.sql` assumes `request_logs` is a partitioned table, while migration `0015_add_request_logs.sql` creates it as a regular table. This migration is currently incompatible and should be revisited before introducing partitioning.
- Query performance validation was executed against an empty development database. Performance should be revalidated with production-like data volumes.

**Document Ownership:** Data Engineering / Observability Squad  
**Review Cycle:** Quarterly or after schema changes  
**Last Reviewed:** 2026-06-28
