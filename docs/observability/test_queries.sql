-- Observability KPIs Test Queries
-- Purpose: Quick validation that all queries work against current schema
-- Date: 2026-06-28
-- Usage: psql -U postgres -d fury_app -f test_queries.sql

-- ============================================================================
-- BUSINESS KPIs TESTS
-- ============================================================================

-- Test 1: MRR (Monthly Recurring Revenue)
-- Expected: Shows current month MRR, number of paid subscriptions
SELECT
  DATE_TRUNC('month', i.created_at)::DATE as period_start,
  SUM(i.amount_cents) / 100.0 as mrr_brl,
  COUNT(DISTINCT i.subscription_id) as paid_subscriptions
FROM invoices i
WHERE i.status = 'paid'
  AND i.paid_at IS NOT NULL
  AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', i.created_at);

-- Expected output: 1 row (or 0 if no paid invoices this month)


-- Test 2: Trial to Paid Conversion
-- Expected: Shows trial conversion estimate
SELECT
  DATE_TRUNC('month', s.created_at)::DATE as cohort_month,
  COUNT(*) as trials_started,
  COUNT(*) FILTER (WHERE s.status = 'active') as converted_to_active,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE s.status = 'active') / COUNT(*),
    2
  ) as conversion_rate_pct
FROM subscriptions s
WHERE s.trial_ends_at IS NOT NULL
  AND s.trial_ends_at > s.created_at
GROUP BY DATE_TRUNC('month', s.created_at)
ORDER BY cohort_month DESC
LIMIT 3;

-- Expected output: 0-N rows depending on trial subscriptions


-- Test 3: Churn Rate
-- Expected: Shows monthly churn estimate
SELECT
  DATE_TRUNC('month', s.updated_at)::DATE as churn_month,
  COUNT(*) as churned_subscriptions
FROM subscriptions s
WHERE s.status = 'cancelled'
GROUP BY DATE_TRUNC('month', s.updated_at)
ORDER BY churn_month DESC
LIMIT 3;

-- Expected output: 0-N rows depending on cancelled subscriptions


-- Test 4: ROAS (Return on Ad Spend)
-- Expected: Shows campaign ROAS if metrics populated
SELECT
  c.id as campaign_id,
  c.name,
  c.status,
  (c.metrics->>'spend')::NUMERIC as spend_brl,
  (c.metrics->>'revenue')::NUMERIC as revenue_brl,
  CASE
    WHEN (c.metrics->>'spend')::NUMERIC = 0 OR c.metrics->>'spend' IS NULL THEN NULL
    ELSE ROUND(((c.metrics->>'revenue')::NUMERIC / (c.metrics->>'spend')::NUMERIC)::NUMERIC, 2)
  END as roas
FROM campaigns c
WHERE c.status IN ('active', 'paused')
  AND c.metrics->>'spend' IS NOT NULL
  AND (c.metrics->>'spend')::NUMERIC > 0
ORDER BY c.created_at DESC
LIMIT 5;

-- Expected output: 0-N rows depending on campaigns with metrics

-- ============================================================================
-- TECHNICAL KPIs TESTS
-- ============================================================================

-- Test 5: Active Campaigns Count
-- Expected: Shows total active campaigns
SELECT
  COUNT(*) as active_campaigns_total,
  COUNT(DISTINCT tenant_id) as tenants_with_active_campaigns
FROM campaigns
WHERE status = 'active';

-- Expected output: 1 row with count values


-- Test 6: Response Time Percentiles (Last 24h)
-- Expected: Shows latency distribution
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY rl.response_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.response_time_ms) as p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY rl.response_time_ms) as p99_ms,
  AVG(rl.response_time_ms)::INT as avg_ms,
  COUNT(*) as sample_count
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- Expected output: 1 row with percentile values


-- Test 7: Error Rate (Last 24h)
-- Expected: Shows 4xx and 5xx error counts
SELECT
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE rl.status_code >= 400 AND rl.status_code < 500) as errors_4xx,
  COUNT(*) FILTER (WHERE rl.status_code >= 500) as errors_5xx,
  ROUND(
  100.0 * COUNT(*) FILTER (WHERE rl.status_code >= 400)
  / NULLIF(COUNT(*), 0),
  2
) as error_rate_pct
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- Expected output: 1 row with error counts and rates


-- Test 8: Requests Per Minute (Last 24h)
-- Expected: Shows RPM trend hourly
SELECT
  DATE_TRUNC('hour', rl.created_at) as hour,
  COUNT(*) as request_count
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', rl.created_at)
ORDER BY hour DESC
LIMIT 5;

-- Expected output: Up to 24 rows (one per hour)


-- Test 9: Slow Endpoints (Last 7 days)
-- Expected: Shows slowest endpoints
SELECT
  COALESCE(rl.path_template, rl.path) as endpoint,
  rl.method,
  COUNT(*) as request_count,
  AVG(rl.response_time_ms)::INT as avg_ms
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY COALESCE(rl.path_template, rl.path), rl.method
HAVING COUNT(*) >= 10
ORDER BY avg_ms DESC
LIMIT 10;

-- Expected output: Top 10 slow endpoints


-- ============================================================================
-- ENGAGEMENT KPIs TESTS
-- ============================================================================

-- Test 10: Active Tenants (24h)
-- Expected: Shows unique active tenants
SELECT
  COUNT(DISTINCT rl.tenant_id) as active_tenants_24h,
  COUNT(DISTINCT rl.user_id) as active_users_24h,
  COUNT(*) as total_requests
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND rl.tenant_id IS NOT NULL;

-- Expected output: 1 row with unique counts


-- Test 11: Automation Rules Created and Triggered
-- Expected: Shows automation activity
SELECT
  DATE_TRUNC('day', ar.created_at)::DATE as date,
  COUNT(*) as rules_created,
  COUNT(*) FILTER (WHERE ar.is_active = true) as rules_active
FROM automation_rules ar
WHERE ar.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', ar.created_at)
ORDER BY date DESC
LIMIT 7;

-- Expected output: Up to 7 rows (one per day)


-- Test 11b: Automation Rules Triggered
-- Expected: Shows automation execution activity
SELECT
  DATE_TRUNC('day', re.triggered_at)::DATE as date,
  COUNT(*) as executions_count,
  COUNT(DISTINCT re.rule_id) as unique_rules_triggered
FROM rule_executions re
WHERE re.triggered_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', re.triggered_at)
ORDER BY date DESC
LIMIT 7;

-- Expected output: 0-7 rows depending on rule executions


-- Test 12: Creative Assets Generated
-- Expected: Shows creative generation by type
SELECT
  DATE_TRUNC('day', ca.created_at)::DATE as date,
  ca.type,
  COUNT(*) as total_generated,
  COUNT(*) FILTER (WHERE ca.compliance_status = 'approved') as approved,
  COUNT(*) FILTER (WHERE ca.compliance_status = 'rejected') as rejected
FROM creative_assets ca
WHERE ca.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', ca.created_at), ca.type
ORDER BY date DESC
LIMIT 7;

-- Expected output: 0-14 rows depending on creative generation


-- ============================================================================
-- SCHEMA VALIDATION TESTS
-- ============================================================================

-- Verify all required tables exist
SELECT
  schemaname,
  tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'invoices',
  'subscriptions',
  'campaigns',
  'request_logs',
  'automation_rules',
  'rule_executions',
  'creative_assets'
)
ORDER BY tablename;

-- Expected output: 7 rows (all tables present)


-- Verify critical indexes exist
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'request_logs'
  AND indexname LIKE 'idx_%'
ORDER BY indexname;

-- Expected output: At least 2 indexes (idx_request_logs_tenant_created, idx_request_logs_status_created)


-- Verify enum types exist
SELECT
    t.typname AS enum_name,
    array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e
    ON e.enumtypid = t.oid
WHERE t.typname IN (
    'campaign_status',
    'subscription_status',
    'invoice_status'
)
GROUP BY t.typname
ORDER BY t.typname;

-- Expected output: 3 rows with enum values


-- ============================================================================
-- PERFORMANCE BASELINE TESTS
-- ============================================================================

-- Test query performance with EXPLAIN ANALYZE
-- Run these to ensure queries use indexes effectively

EXPLAIN ANALYZE
SELECT COUNT(*)
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- Expected: Should use idx_request_logs_tenant_created or idx_request_logs_status_created
-- Time: < 100ms


EXPLAIN ANALYZE
SELECT COUNT(DISTINCT tenant_id)
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND tenant_id IS NOT NULL;

-- Expected: Should use idx_request_logs_tenant_created
-- Time: < 100ms


EXPLAIN ANALYZE
SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- Expected: Sequential scan is okay for percentile (can't use index for ORDER BY in PERCENTILE_CONT)
-- Time: < 500ms for typical 24h log volume


EXPLAIN ANALYZE
SELECT c.id, c.status, c.metrics->>'spend'
FROM campaigns c
WHERE c.status = 'active'
  AND c.metrics->>'spend' IS NOT NULL;

-- Expected: Sequential scan (no index on metrics JSONB)
-- Time: < 50ms (small table)


-- ============================================================================
-- OUTPUT SUMMARY
-- ============================================================================

-- If all queries above return results (or 0 rows with no errors),
-- then all KPIs are ready for Grafana dashboard integration.

-- Summary of expected results:
-- Test 1 (MRR): 1 row (0 if no paid invoices)
-- Test 2 (Trial→Paid): 0+ rows
-- Test 3 (Churn): 0+ rows
-- Test 4 (ROAS): 0+ rows
-- Test 5 (Active Campaigns): 1 row
-- Test 6 (Latency): 1 row
-- Test 7 (Error Rate): 1 row
-- Test 8 (RPS): 1-24 rows
-- Test 9 (Slow Endpoints): 0-10 rows
-- Test 10 (Active Tenants): 1 row
-- Test 11 (Automations): 0-7 rows
-- Test 11b (Automation Executions): 0-7 rows
-- Test 12 (Creatives): 0-14 rows
-- Validation: 7 rows (all tables)
-- Schema: ✅ Pass

-- ============================================================================
-- SUCCESS CRITERIA
-- ============================================================================

-- ✅ All queries run without errors
-- ✅ No NULL column errors (all tables/columns exist)
-- ✅ PERCENTILE_CONT() works (PostgreSQL 9.4+)
-- ✅ FILTER WHERE syntax works (PostgreSQL 9.4+)
-- ✅ JSONB operators (->>)work
-- ✅ All 7 required tables present
-- ✅ All critical indexes present
-- ✅ Query performance < 1 second (except aggregates on large datasets)

-- If all above pass, KPIs documentation is validated and ready for production.
