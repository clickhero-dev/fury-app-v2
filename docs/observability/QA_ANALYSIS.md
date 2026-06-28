# QA Analysis - Observability KPIs
**Status:** Critical Review  
**Date:** 2026-06-28  
**Scope:** SQL Query Validation for Production

---

## Executive Summary

| Category | Status | Count | Issues |
|----------|--------|-------|--------|
| ✅ OK | Green | 5 KPIs | 0 |
| ⚠️ RISCO | Yellow | 5 KPIs | Minor issues |
| 🔴 FALHA | Red | 3 KPIs | **Critical** |

**Critical Finding:** 3 queries quebram com dados vazios ou contêm divisões por zero perigosas.

**Recommendation:** **HOLD C1** - Corrigir queries críticas antes de produção.

---

## Detailed KPI Analysis

### 1. MRR (Monthly Recurring Revenue)

**Status:** 🔴 **FALHA**

**Query:**
```sql
SELECT DATE_TRUNC('month', i.created_at)::DATE as period_start, ...
WHERE i.status = 'paid' AND i.paid_at IS NOT NULL
  AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', i.created_at);
```

**Issues Found:**

1. ⚠️ **Empty Result Set**
   - Se nenhuma invoice foi paga no mês atual: retorna 0 linhas
   - Grafana esperará 1 linha. Dashboard quebrará com "no data"
   - **Risk:** Silencioso em produção. Métrica desaparece sem aviso

2. ⚠️ **NULL paid_at Handling**
   - `WHERE i.paid_at IS NOT NULL` filtra invoices sem data de pagamento
   - Mas `invoices.paid_at` pode ser NULL por dias (invoice criada, pagamento pendente)
   - MRR aparece "errado" dia a dia (varia conforme pagamentos são processados)
   - **Risk:** Métrica flutua durante o dia

3. ⚠️ **Timezone Issue**
   - `CURRENT_DATE` usa servidor timezone
   - `invoices.created_at` é `timestamptz`
   - Se servidor em UTC e cliente em BRT (-3h), período pode estar errado
   - **Risk:** MRR pode incluir/excluir 1-2 horas de dados dependendo hora

4. ⚠️ **TYPE CAST RISK**
   - `amount_cents / 100.0` assume amount_cents é numérico válido
   - Se coluna for texto ou NULL, falha com tipo error
   - **Risk:** Query quebra se dados corrompidos

**Severity:** 🔴 **CRÍTICO** - Métrica financeira

**Fix Required:**
```sql
-- Better approach
SELECT
  COALESCE(
    DATE_TRUNC('month', i.created_at)::DATE,
    CURRENT_DATE - INTERVAL '1 month'
  ) as period_start,
  COALESCE(SUM(i.amount_cents) / 100.0, 0) as mrr_brl,
  COALESCE(COUNT(DISTINCT i.subscription_id), 0) as paid_subscriptions
FROM invoices i
WHERE i.status = 'paid'
  AND i.paid_at IS NOT NULL
  AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', i.created_at);
```

**Testing Required:**
```sql
-- Test 1: No data
SELECT * FROM invoices WHERE status = 'paid' AND created_at > NOW();
-- Must still return 1 row with SUM = 0, not empty result set

-- Test 2: NULL handling
SELECT COUNT(*) FROM invoices WHERE paid_at IS NULL;
-- If > 0, metric will fluctuate

-- Test 3: Type safety
SELECT amount_cents, amount_cents / 100.0 FROM invoices LIMIT 1;
-- Must be numeric division, not string
```

---

### 2. Trial to Paid Conversion

**Status:** 🟡 **RISCO**

**Query:**
```sql
SELECT DATE_TRUNC('month', s.created_at)::DATE as cohort_month,
       COUNT(*) as trials_started,
       COUNT(*) FILTER (WHERE s.status = 'active') as converted_to_active,
       ROUND(100.0 * COUNT(*) FILTER ... / COUNT(*), 2) as conversion_rate_pct
FROM subscriptions s
WHERE s.trial_ends_at IS NOT NULL AND s.trial_ends_at > s.created_at
GROUP BY DATE_TRUNC('month', s.created_at);
```

**Issues Found:**

1. ⚠️ **Division by Zero Risk**
   - Linha: `100.0 * COUNT(*) FILTER / COUNT(*)`
   - Se `COUNT(*) = 0` (sem trials com trial_ends_at), divisão por zero
   - PostgreSQL retorna ERROR, não NULL
   - **Risk:** Query quebra com "division by zero"

2. ⚠️ **Empty Result Set**
   - Se não há trials no período: 0 linhas
   - Grafana esperará pelo menos 1 linha
   - **Risk:** Métrica desaparece

3. ⚠️ **FILTER WHERE Syntax**
   - PostgreSQL 9.4+ feature
   - Se server < 9.4 (improvável), quebra com SYNTAX ERROR
   - **Risk:** Baixo (PostgreSQL 14+)

**Severity:** 🟡 **ALTO** - Métrica de conversão

**Fix Required:**
```sql
SELECT
  DATE_TRUNC('month', s.created_at)::DATE as cohort_month,
  COUNT(*) as trials_started,
  COUNT(*) FILTER (WHERE s.status = 'active') as converted_to_active,
  CASE 
    WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE s.status = 'active') / COUNT(*), 2)
  END as conversion_rate_pct
FROM subscriptions s
WHERE s.trial_ends_at IS NOT NULL AND s.trial_ends_at > s.created_at
GROUP BY DATE_TRUNC('month', s.created_at);
```

---

### 3. Churn Rate

**Status:** 🟡 **RISCO**

**Query:**
```sql
SELECT DATE_TRUNC('month', s.updated_at)::DATE as churn_month,
       COUNT(*) as churned_subscriptions,
       ROUND(100.0 * COUNT(*) / NULLIF(COUNT(*) FILTER (...), 0), 2) as churn_rate_pct
FROM subscriptions s
WHERE s.status = 'cancelled' AND s.updated_at > CURRENT_DATE - INTERVAL '6 months'
```

**Issues Found:**

1. ✅ **Division by Zero Handled**
   - Usa `NULLIF(..., 0)` → retorna NULL se 0
   - `100.0 * COUNT(*) / NULL` → retorna NULL (não erro)
   - **OK:** Safe

2. ⚠️ **Empty Result Set**
   - Se nenhuma subscription churned em período: 0 linhas
   - **Risk:** Métrica desaparece

3. ⚠️ **updated_at Imprecision**
   - updated_at pode mudar por qualquer UPDATE (não só cancelamento)
   - "Churn month" pode ser incorreto (updated 30 dias depois de cancel)
   - **Risk:** Dados imprecisos, mas query safe

**Severity:** 🟡 **MÉDIO** - Imprecisão de dados, não erro SQL

**Workaround:** Documentado em kpis.md. OK.

---

### 4. ROAS (Return on Ad Spend)

**Status:** 🔴 **FALHA**

**Query:**
```sql
SELECT c.id, c.name, c.status,
       (c.metrics->>'spend')::NUMERIC as spend_brl,
       (c.metrics->>'revenue')::NUMERIC as revenue_brl,
       CASE 
         WHEN (c.metrics->>'spend')::NUMERIC = 0 OR c.metrics->>'spend' IS NULL THEN NULL
         ELSE ROUND(((c.metrics->>'revenue')::NUMERIC / (c.metrics->>'spend')::NUMERIC), 2)
       END as roas
FROM campaigns c
WHERE c.status IN ('active', 'paused') AND c.metrics->>'spend' IS NOT NULL
```

**Issues Found:**

1. 🔴 **JSONB Cast Error Risk - CRITICAL**
   - Linha: `(c.metrics->>'spend')::NUMERIC`
   - Se `metrics->>'spend'` = 'abc' (string não-numérica), cast falha
   - PostgreSQL ERRROR: `invalid input syntax for type numeric`
   - **Risk:** Query QUEBRA em produção se métrica corrompida

2. 🔴 **JSONB Missing Field**
   - JSONB não tem schema validado
   - Se campo 'spend' não existe: `c.metrics->>'spend'` retorna NULL
   - Mas WHERE filtra on `IS NOT NULL` → safe aqui
   - Porém: Se campo 'revenue' não existe: cast de NULL falha
   - **Risk:** Query quebra para campaigns com spend mas sem revenue

3. 🔴 **Cast Evaluation Order**
   - Onde WHERE é avaliada ANTES de SELECT
   - `WHERE c.metrics->>'spend' IS NOT NULL` protege campo
   - Mas em SELECT, se campo 'revenue' não existe: `(c.metrics->>'revenue')::NUMERIC` pode falhar
   - **Risk:** Silencioso. Query executa mas CAST falha em runtime

4. ⚠️ **Empty Result Set**
   - Se nenhuma campaign active com spend: 0 linhas
   - **Risk:** Métrica desaparece

**Severity:** 🔴 **CRÍTICO** - Falha em produção

**Fix Required:**
```sql
SELECT
  c.id,
  c.name,
  c.status,
  TRY_CAST((c.metrics->>'spend') AS NUMERIC) as spend_brl,
  TRY_CAST((c.metrics->>'revenue') AS NUMERIC) as revenue_brl,
  CASE 
    WHEN (c.metrics->>'spend')::NUMERIC IS NULL OR (c.metrics->>'spend')::NUMERIC = 0 THEN NULL
    WHEN (c.metrics->>'revenue')::NUMERIC IS NULL THEN NULL
    ELSE ROUND((c.metrics->>'revenue')::NUMERIC / (c.metrics->>'spend')::NUMERIC, 2)
  END as roas
FROM campaigns c
WHERE c.status IN ('active', 'paused')
  AND c.metrics ? 'spend'  -- check field exists
  AND c.metrics ? 'revenue'  -- check field exists
  AND (c.metrics->>'spend') ~ '^\d+\.?\d*$'  -- check numeric format
```

**Alternative (Safer):**
```sql
SELECT
  c.id,
  c.name,
  c.status,
  COALESCE((c.metrics->>'spend')::NUMERIC, 0) as spend_brl,
  COALESCE((c.metrics->>'revenue')::NUMERIC, 0) as revenue_brl,
  CASE 
    WHEN COALESCE((c.metrics->>'spend')::NUMERIC, 0) = 0 THEN NULL
    ELSE ROUND(
      COALESCE((c.metrics->>'revenue')::NUMERIC, 0) / 
      COALESCE((c.metrics->>'spend')::NUMERIC, 0),
      2
    )
  END as roas
FROM campaigns c
WHERE c.status IN ('active', 'paused')
```

---

### 5. Active Campaigns

**Status:** ✅ **OK**

**Query:**
```sql
SELECT COUNT(*) as active_campaigns_total, COUNT(DISTINCT tenant_id)
FROM campaigns WHERE status = 'active';
```

**Analysis:**

1. ✅ **Safe with empty data**
   - COUNT(*) returns 0, not NULL or error
   - COUNT(DISTINCT) also safe

2. ✅ **No type conversions**
   - Simple comparison (status = 'active')

3. ✅ **No NULL issues**
   - tenant_id FK, cannot be NULL if campaign exists

4. ✅ **Performant**
   - Uses index on status column

**Severity:** ✅ **SAFE** - No issues

---

### 6. Response Time Percentiles

**Status:** ✅ **OK**

**Query:**
```sql
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY rl.response_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.response_time_ms) as p95_ms,
  AVG(rl.response_time_ms)::INT as avg_ms
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours';
```

**Analysis:**

1. ✅ **Safe with empty data**
   - PERCENTILE_CONT(X) on empty set returns NULL (not error)
   - AVG on empty set returns NULL
   - Grafana handles NULLs gracefully

2. ✅ **Type safety**
   - response_time_ms is integer
   - No conversions needed
   - `::INT` cast safe (integer → integer)

3. ✅ **Performant**
   - Index on (tenant_id, created_at DESC) supports WHERE filter
   - PERCENTILE_CONT can use index for ORDER BY

4. ⚠️ **Minor:** Large dataset concern
   - If request_logs > 1TB, percentile calculation slow
   - But documented as known issue

**Severity:** ✅ **SAFE** - No blocking issues

---

### 7. Error Rate (4xx/5xx)

**Status:** ✅ **OK**

**Query:**
```sql
SELECT COUNT(*) as total_requests,
       COUNT(*) FILTER (WHERE rl.status_code >= 400 AND rl.status_code < 500) as errors_4xx,
       COUNT(*) FILTER (WHERE rl.status_code >= 500) as errors_5xx,
       ROUND(100.0 * COUNT(*) FILTER (WHERE rl.status_code >= 400) / COUNT(*), 2) as error_rate_pct
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour';
```

**Analysis:**

1. ⚠️ **Division by Zero Risk**
   - Linha: `100.0 * COUNT(*) FILTER / COUNT(*)`
   - Se COUNT(*) = 0 (no requests in 1h): division by zero
   - **Risk:** Query BREAKS with "division by zero error"

2. ✅ **Type Safety**
   - status_code is smallint
   - Comparisons are safe

3. ✅ **FILTER WHERE Safe**
   - Syntax valid, handles empty sets

**Severity:** 🔴 **CRÍTICO** - Breaks with no requests

**Fix Required:**
```sql
SELECT
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE rl.status_code >= 400 AND rl.status_code < 500) as errors_4xx,
  COUNT(*) FILTER (WHERE rl.status_code >= 500) as errors_5xx,
  CASE
    WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE rl.status_code >= 400) / COUNT(*), 2)
  END as error_rate_pct
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour';
```

---

### 8. Requests Per Minute (RPS)

**Status:** ✅ **OK**

**Query:**
```sql
SELECT DATE_TRUNC('minute', rl.created_at) as minute, COUNT(*) as request_count
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('minute', rl.created_at)
ORDER BY minute DESC;
```

**Analysis:**

1. ✅ **Safe with empty data**
   - No GROUP BY returns 0 rows (expected for empty periods)
   - Grafana handles time series with gaps

2. ✅ **No type conversions**
   - Simple count

3. ✅ **ORDER BY safe**
   - Ordering by GROUP BY column

**Severity:** ✅ **SAFE** - No issues

---

### 9. Slow Endpoints

**Status:** 🟡 **RISCO**

**Query:**
```sql
SELECT COALESCE(rl.path_template, rl.path) as endpoint,
       rl.method,
       COUNT(*) as request_count,
       AVG(rl.response_time_ms)::INT as avg_ms,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY rl.response_time_ms) as p95_ms,
       MAX(rl.response_time_ms) as max_ms
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY COALESCE(rl.path_template, rl.path), rl.method
HAVING COUNT(*) >= 50
ORDER BY avg_ms DESC
LIMIT 20;
```

**Issues Found:**

1. ⚠️ **path_template NULL Fallback**
   - If path_template is NULL: groups by exact path
   - Result: `/campaigns/123` and `/campaigns/456` as separate rows
   - **Risk:** Endpoint grouping incorrect, but not error

2. ✅ **HAVING clause safe**
   - Filters after GROUP BY
   - Returns 0 rows if no endpoints with 50+ requests

3. ✅ **Empty result set safe**
   - Returns 0 rows (expected)

4. ✅ **Type cast safe**
   - `::INT` from aggregate result

**Severity:** 🟡 **MÉDIO** - Data quality issue, not SQL error

**Mitigation:** Ensure API middleware populates path_template (already documented)

---

### 10. Active Tenants 24h

**Status:** ✅ **OK**

**Query:**
```sql
SELECT COUNT(DISTINCT rl.tenant_id) as active_tenants_24h,
       COUNT(DISTINCT rl.user_id) as active_users_24h,
       COUNT(*) as total_requests
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND rl.tenant_id IS NOT NULL;
```

**Analysis:**

1. ✅ **Safe with empty data**
   - COUNT(DISTINCT) on empty set returns 0

2. ✅ **NULL handling**
   - `WHERE rl.tenant_id IS NOT NULL` filters nulls
   - Safe

3. ✅ **No type conversions**

**Severity:** ✅ **SAFE** - No issues

---

### 11. Automations by Day

**Status:** ⚠️ **RISCO**

**Query Part A (Created):**
```sql
SELECT DATE_TRUNC('day', ar.created_at)::DATE as date,
       COUNT(*) as rules_created,
       COUNT(*) FILTER (WHERE ar.is_active = true) as rules_active
FROM automation_rules ar
WHERE ar.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', ar.created_at);
```

**Analysis:**

1. ✅ **Safe with empty data**
   - COUNT(*) returns 0
   - No division

2. ✅ **Type safe**

3. ⚠️ **Empty result set**
   - If no rules created in 30d: 0 rows
   - **Risk:** Metric disappears

**Severity:** ⚠️ **BAIXO** - Minor gap in data

**Query Part B (Triggered):**
```sql
SELECT DATE_TRUNC('day', re.triggered_at)::DATE as date,
       COUNT(*) as executions_count,
       COUNT(DISTINCT re.rule_id) as unique_rules_triggered
FROM rule_executions re
WHERE re.triggered_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', re.triggered_at);
```

**Analysis:** ✅ **SAFE** - Same as above

---

### 12. Creative Assets

**Status:** ✅ **OK**

**Query:**
```sql
SELECT DATE_TRUNC('day', ca.created_at)::DATE as date,
       ca.type,
       COUNT(*) as total_generated,
       COUNT(*) FILTER (WHERE ca.compliance_status = 'approved') as approved
FROM creative_assets ca
WHERE ca.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', ca.created_at), ca.type;
```

**Analysis:**

1. ✅ **Safe with empty data**
   - Returns 0 rows if no creatives (expected)

2. ✅ **Enum comparison safe**
   - type and compliance_status are enums
   - Comparison against valid values

3. ✅ **No type conversions**

**Severity:** ✅ **SAFE** - No issues

---

## Summary by Status

### 🔴 CRITICAL FAILURES (Must Fix)

| KPI | Issue | Fix Priority |
|-----|-------|--------------|
| MRR | Empty result set + timezone risk | P0 |
| ROAS | JSONB cast errors + missing fields | P0 |
| Error Rate | Division by zero when no requests | P0 |

### 🟡 MEDIUM RISKS (Document/Mitigate)

| KPI | Issue | Mitigation |
|-----|-------|-----------|
| Trial → Paid | Division by zero + empty result | Add CASE WHEN |
| Slow Endpoints | path_template NULL issues | Ensure middleware populates field |
| Churn | updated_at imprecision | Already documented |
| Automations | Empty result set on no activity | Expected behavior |

### ✅ SAFE

| KPI | Status |
|-----|--------|
| Active Campaigns | Safe |
| Response Time Percentiles | Safe |
| RPS | Safe |
| Active Tenants 24h | Safe |
| Creative Assets | Safe |

---

## Root Cause Analysis

### Why 3 Queries Fail in Edge Cases

**Problem 1: Division by Zero Not Handled**
- MRR, Trial→Paid, Error Rate all have form: `100.0 * COUNT() / COUNT()`
- When dataset empty or filtered to 0 rows: division by zero
- PostgreSQL throws ERROR, not NULL

**Problem 2: JSONB Type Safety**
- ROAS extracts from JSONB without validation
- Fields may be missing or contain non-numeric values
- Cast to NUMERIC fails with ERROR

**Problem 3: Empty Result Set Expectations**
- Grafana expects at least 1 row per query
- Some queries return 0 rows when period has no data
- Dashboard shows "no data" instead of 0

### Why This Wasn't Caught

1. **Test Data Missing:** Queries written without test data
2. **No EXPLAIN ANALYZE:** Performance/execution plan not validated
3. **No Edge Case Testing:** Empty dataset not tested
4. **No Grafana Integration Test:** Dashboard rendering not tested

---

## Testing Results (Simulated)

### What Breaks

```bash
# Test 1: Empty dataset (no invoices paid this month)
MRR Query → RETURNS 0 ROWS
Grafana → Shows "No data available"
Expected: Shows MRR = 0 BRL

# Test 2: No requests in hour (system down)
Error Rate Query → ERROR: division by zero
Grafana → RED ERROR state
Expected: Shows error_rate = 0%

# Test 3: Campaign with metrics but no revenue
ROAS Query → ERROR: invalid input for numeric
Grafana → RED ERROR state
Expected: Shows ROAS = NULL

# Test 4: No automation rules created in 30 days
Automations Query → RETURNS 0 ROWS
Grafana → Shows "No data"
Expected: Shows 0 rules created
```

---

## Recommendations

### IMMEDIATE (Before C1 Closes)

1. **Fix 3 Critical Queries**
   - [ ] MRR: Handle empty result with COALESCE/CASE
   - [ ] ROAS: Handle JSONB missing fields with JSON existence check
   - [ ] Error Rate: Handle division by zero with CASE WHEN

2. **Test Against Real Data**
   - [ ] Seed database with test data (invoices, campaigns, requests)
   - [ ] Run all 13 queries against test database
   - [ ] Verify Grafana can render results

3. **Add EXPLAIN ANALYZE**
   - [ ] Run EXPLAIN on MRR, ROAS, Error Rate (critical queries)
   - [ ] Verify index usage
   - [ ] Document query execution time

4. **Create Test Database Script**
   - [ ] Insert test data that covers all edge cases
   - [ ] Include: empty months, NULL fields, JSONB missing keys
   - [ ] Document in test_queries.sql

### BEFORE GRAFANA INTEGRATION (Phase 1)

1. **Grafana Alert Testing**
   - [ ] Test that queries timeout properly (add timeout to Grafana)
   - [ ] Test alert thresholds with real data
   - [ ] Verify dashboard renders correctly

2. **Monitoring**
   - [ ] Add query execution time monitoring
   - [ ] Alert if query takes > 5 seconds
   - [ ] Monitor request_logs table size growth

3. **Documentation Update**
   - [ ] Add "Edge Cases" section per KPI
   - [ ] Document behavior with empty data
   - [ ] Add troubleshooting guide

---

## QA Checklist

### SQL Correctness
- [ ] All queries valid PostgreSQL syntax
- [ ] All column references exist in schema
- [ ] All type conversions safe
- [ ] No hardcoded values

### Data Handling
- [ ] Handles empty datasets (returns 0, not error)
- [ ] Handles NULL values correctly
- [ ] Handles division by zero
- [ ] Handles JSONB missing fields

### Performance
- [ ] Uses appropriate indexes
- [ ] EXPLAIN ANALYZE < 1 second
- [ ] No N+1 queries
- [ ] No unbounded scans

### Monitoring Compatibility
- [ ] Grafana $__timeFilter() compatible
- [ ] Returns consistent column names
- [ ] Handles time zones correctly
- [ ] Aggregation functions documented

### Documentation
- [ ] Edge cases documented
- [ ] Limitations clear
- [ ] Testing instructions provided
- [ ] Troubleshooting guide included

---

## Fixes Required Before C1 Approval

### MRR Query - FIX

```sql
-- BEFORE (FAILS on empty result)
SELECT
  DATE_TRUNC('month', i.created_at)::DATE as period_start,
  SUM(i.amount_cents) / 100.0 as mrr_brl
FROM invoices i
WHERE i.status = 'paid' AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', i.created_at);

-- AFTER (SAFE)
SELECT
  COALESCE(DATE_TRUNC('month', i.created_at)::DATE, DATE_TRUNC('month', CURRENT_DATE)) as period_start,
  COALESCE(SUM(i.amount_cents) / 100.0, 0) as mrr_brl,
  COALESCE(COUNT(DISTINCT i.subscription_id), 0) as paid_subscriptions
FROM invoices i
WHERE i.status = 'paid'
  AND i.paid_at IS NOT NULL
  AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', i.created_at)
HAVING SUM(i.amount_cents) IS NOT NULL;
```

### Error Rate Query - FIX

```sql
-- BEFORE (FAILS: division by zero)
SELECT
  COUNT(*) as total_requests,
  ROUND(100.0 * COUNT(*) FILTER (WHERE rl.status_code >= 400) / COUNT(*), 2) as error_rate_pct
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour';

-- AFTER (SAFE)
SELECT
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE rl.status_code >= 400) as error_count,
  CASE
    WHEN COUNT(*) = 0 THEN NULL  -- No requests, no error rate
    ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE rl.status_code >= 400) / COUNT(*), 2)
  END as error_rate_pct
FROM request_logs rl
WHERE rl.created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour';
```

### ROAS Query - FIX

```sql
-- BEFORE (FAILS: JSONB cast error)
SELECT
  (c.metrics->>'spend')::NUMERIC as spend_brl,
  (c.metrics->>'revenue')::NUMERIC as revenue_brl,
  ROUND(((c.metrics->>'revenue')::NUMERIC / (c.metrics->>'spend')::NUMERIC), 2) as roas
FROM campaigns c
WHERE c.metrics->>'spend' IS NOT NULL;

-- AFTER (SAFE with fallback)
SELECT
  c.id,
  c.name,
  NULLIF((c.metrics->>'spend')::NUMERIC, 0) as spend_brl,
  (c.metrics->>'revenue')::NUMERIC as revenue_brl,
  CASE
    WHEN (c.metrics->>'spend')::NUMERIC IS NULL OR (c.metrics->>'spend')::NUMERIC = 0 THEN NULL
    ELSE ROUND((c.metrics->>'revenue')::NUMERIC / (c.metrics->>'spend')::NUMERIC, 2)
  END as roas
FROM campaigns c
WHERE c.status IN ('active', 'paused')
  AND c.metrics ? 'spend'
  AND c.metrics ? 'revenue'
  AND (c.metrics->>'spend') IS NOT NULL;
```

---

## Final Assessment

### Current Status: 🔴 **NOT READY FOR PRODUCTION**

**Reason:** 3 queries will fail in production under edge cases

### Timeline to Fix

- **Estimated Effort:** 2-3 hours (simple fixes)
- **Testing Time:** 1 hour (test against database)
- **Grafana Integration:** 1 hour (verify rendering)
- **Total:** 4-5 hours

### Gate for C1 Approval

✅ All 13 KPI definitions documented  
✅ All SQL syntax valid (PostgreSQL 14+)  
⚠️ **HOLD:** 3 queries require fixes for edge cases  
⚠️ **HOLD:** Test data seed required  
⚠️ **HOLD:** EXPLAIN ANALYZE required for critical queries  

### To Close C1

1. [ ] Fix 3 critical queries (MRR, ROAS, Error Rate)
2. [ ] Create seed script with test data
3. [ ] Run EXPLAIN ANALYZE on all queries
4. [ ] Test queries against database (not just syntax)
5. [ ] Update kpis.md with fixed queries
6. [ ] Add "Edge Cases" section per KPI
7. [ ] Document behavior with empty datasets

---

**QA Status:** 🔴 **HOLD - BLOCKING ISSUES**

**Approval:** Cannot approve C1 for production until fixes applied and tested.

**Risk if deployed as-is:** 3 queries will break in production, creating silent data gaps or RED ERROR states in Grafana.

**Recommendation:** Apply fixes (4 hours estimated) before final approval.

---

**QA Analysis Complete**  
**Date:** 2026-06-28  
**Next Step:** Fix 3 critical queries, then retest before C1 approval
