# Observability Documentation

## Overview

This directory contains observability and KPI documentation for the FURY app.

## Files

### 1. `kpis.md` - Main Documentation
**Status:** ✅ Ready for Implementation  
**Size:** 13 KPIs, 1000+ lines  
**Time to Read:** 30-45 minutes

Complete reference for all Key Performance Indicators including:
- **4 Business KPIs:** MRR, Trial→Paid, Churn, ROAS
- **5 Technical KPIs:** Active Campaigns, Response Time (p50/p95/p99), Error Rate (4xx/5xx), RPS, Slow Endpoints
- **4 Engagement KPIs:** Active Tenants (24h), Automations/Day, Creatives Generated, Form Completion Rate

**For each KPI:**
- Complete description and formula
- Production-ready SQL queries
- Grafana `$__timeFilter()` macro compatible
- Update frequency and alerting thresholds
- Known limitations and workarounds

### 2. `SCHEMA_VALIDATION.md` - Technical Validation Report
**Status:** ✅ All Checks Passed  
**Scope:** Verification of schema compliance

Validates:
- All 7 tables and 30+ columns exist
- All enum values match query filters
- All indexes in place
- PostgreSQL 14+ compatibility
- NULL handling and edge cases

---

## Quick Start

### For Dashboards Team

1. Copy SQL queries from `kpis.md` into Grafana
2. Use `$__timeFilter(created_at)` macro for time filters
3. Set alert thresholds from "Threshold for Alert" sections
4. Reference "Limitations & Observations" for context

### For Database Team

1. Review `SCHEMA_VALIDATION.md` for index recommendations
2. Monitor `request_logs` table growth (plan for partitioning > 10GB)
3. No schema changes needed to implement these KPIs
4. Consider adding `request_logs.response_time_indexed` index for latency queries

### For Product Team

1. Read KPI descriptions in `kpis.md` for business context
2. Use "Engagement KPIs" section to track feature adoption
3. Correlate Trial→Paid and Churn metrics with manual audits
4. Monitor ROAS `last_synced_at` for data freshness

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| KPI Definitions | ✅ Complete | 13 KPIs documented |
| SQL Queries | ✅ Complete | Tested for PostgreSQL 14+ |
| Schema Validation | ✅ Complete | All checks passed |
| Grafana Integration | 🟡 Ready | Queries need dashboard setup |
| Alerting Rules | 🟡 Ready | Thresholds defined, need alert config |
| Documentation | ✅ Complete | Professional format with examples |

---

## Key Implementation Notes

### What's Included

✅ **13 production-ready SQL queries**
- All use PostgreSQL 14+ native functions
- Compatible with Grafana time-series dashboards
- No views created (direct queries only)
- No schema changes required

✅ **Full transparency on limitations**
- Trial→Paid, Churn: imprecise without status_history table
- ROAS: may be stale, no update timestamp in schema
- Top Endpoints: path_template can be NULL
- All limitations documented with recommended workarounds

✅ **Professional format**
- Business + Technical + Engagement KPIs separated
- Clear formulas, queries, and update frequencies
- Alert thresholds defined for each KPI
- Testing instructions included

### What's NOT Included (Out of C1 Scope)

❌ REST API endpoints
❌ Grafana dashboard JSON
❌ Alert configuration (PagerDuty, Slack, etc.)
❌ Data warehouse ETL pipeline
❌ Schema migrations or database changes
❌ Frontend dashboard UI
❌ Historical metric retention policy

These are Phase 2+ items.

---

## Data Quality Notes

### High Confidence Metrics (🟢 Green)

These metrics have direct, normalized columns and are reliable:
- MRR
- Active Campaigns
- Response Time Percentiles
- Error Rate
- RPS
- Active Tenants 24h
- Creatives Generated
- Automations/Day

### Medium Confidence Metrics (🟡 Yellow)

These use workarounds or imprecise data sources:
- **Trial→Paid:** No status history; uses trial_ends_at as proxy
- **Churn:** No canceled_at; uses updated_at (may change for other reasons)
- **ROAS:** JSONB field without update timestamp; data may be stale
- **Top Endpoints:** path_template can be NULL; uses exact path as fallback

Always display disclaimers alongside these metrics in dashboards.

### Unknown Completeness Metrics (⚠️ Needs Validation)

- **Automation Rules:** No tracking of success/failure; action_taken may not indicate successful execution
- **Creatives:** No campaign attribution; can't track which creatives were actually used

These metrics indicate activity, not effectiveness. Supplement with feature-specific usage metrics.

---

## Next Steps (Post C1)

### Phase 2: Enhanced Observability
1. Create `subscription_status_history` table for accurate Trial→Paid and Churn
2. Add `canceled_at` and `cancellation_reason` to subscriptions
3. Add `last_metric_updated_at` to campaigns
4. Implement request_logs partitioning (>10GB)

### Phase 3: Advanced Analytics
1. Add `campaign_id` FK to creative_assets
2. Track creative performance (impressions, clicks, conversions)
3. Build cohort analysis tables
4. Implement data retention/TTL policies

### Phase 4: Real-Time Observability
1. Deploy OpenTelemetry instrumentation
2. Set up time-series database (InfluxDB, Prometheus)
3. Configure automatic alert escalation
4. Build real-time alerting dashboard

---

## Reference Links

- **Schema Migrations:** `packages/db/migrations/`
- **Database Config:** `packages/db/drizzle.config.ts`
- **API Middleware:** `apps/api/src/middleware/` (where request_logs populated)
- **Meta Integration:** `apps/api/src/routes/meta/` (where campaigns.metrics updated)

---

## Questions & Support

For questions about:
- **KPI Definitions:** Check "Description" and "Formula" sections in kpis.md
- **Query Issues:** Run with EXPLAIN ANALYZE (instructions in "Query Performance Notes")
- **Schema Questions:** Check "Limitations & Known Issues" or SCHEMA_VALIDATION.md
- **Data Freshness:** Review "Update Frequency" and check last webhook sync timestamp

---

**Document Status:** ✅ C1 Implementation Complete  
**Version:** 1.0  
**Date:** 2026-06-28  
**Last Updated:** 2026-06-28

Next Revision: Post-C1 deployment (2026-07-15)
