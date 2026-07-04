# C5 Analysis & Implementation Plan — Grafana Alerts Configuration

**Date:** 2026-07-04  
**Status:** ✅ ANALYSIS COMPLETE - READY FOR IMPLEMENTATION  
**Sprint:** 5 (Observability KPIs)

---

## 📋 EXECUTIVE SUMMARY

**What:** Configure Grafana Alert Rules for C3 & C4 Dashboards + Notification Channel  
**Why:** Proactive monitoring of KPI thresholds; automated notifications to team  
**When:** Post-C4 dashboard deployment  
**Scope:** Grafana alerts (UI-based) + Notification channel (Telegram/Discord) + Documentation  
**Time Estimate:** 3-4 hours (Grafana config) + 1-2 hours (documentation)  
**Backend Changes:** ZERO (C5 is Grafana-only)

---

## 🔍 CURRENT STATE ANALYSIS

### What Was Built (C1-C4)

| Phase | Component | Status | Details |
|-------|-----------|--------|---------|
| **C1** | 13 KPI Definitions | ✅ Complete | Documented in kpis.md |
| **C2** | REST API Endpoints | ✅ Complete | 4 endpoints, 13 KPIs, Redis cache |
| **C3** | Business Dashboard Queries | ✅ Complete | 8 Grafana queries, 4 stat cards + 4 panels |
| **C4** | Technical Dashboard Queries | ✅ Complete | 11 Grafana queries, 7 stat cards + 4 panels |

### What C5 Delivers

| Feature | Status | Scope | Details |
|---------|--------|-------|---------|
| **Grafana Alert Rules** | 🔲 TODO | Alerts on C3/C4 panels | 8-12 alert rules |
| **Notification Channel** | 🔲 TODO | Telegram or Discord | Team notifications |
| **Alert Configuration Guide** | 🔲 TODO | How to set up alerts | Step-by-step docs |
| **Validation & Testing** | 🔲 TODO | Manual testing | Verify alerts fire |

### What C5 Does NOT Include

❌ Backend changes (no migrations, no endpoints, no services, no jobs)  
❌ SuperAdmin authorization  
❌ Audit logging tables  
❌ Cron jobs or background processes  
❌ Slack/email SDK integration (using Grafana native channels only)

---

## 🎯 C5 DETAILED SCOPE

### 1️⃣ Grafana Alert Rules Setup (PRIMARY FOCUS)

#### Goals
- Configure alert rules on C3 (Business) dashboard panels
- Configure alert rules on C4 (Technical) dashboard panels
- Use Grafana's native alerting system (no backend changes)
- Set thresholds based on KPI business requirements
- Notifications via Telegram or Discord

#### Panels to Alert On (C3 - Business Dashboard)

**Stat Cards:**
1. **MRR Alert** — "Alert when MRR drops below R$ 5,000"
   - Condition: `value < 5000`
   - Duration: 5 minutes
   
2. **Trial→Paid Conversion Alert** — "Alert when conversion < 50%"
   - Condition: `value < 50`
   - Duration: 30 minutes (weekly variance is normal)
   
3. **Churn Alert** — "Alert when churn rate > 10%"
   - Condition: `value > 10`
   - Duration: 1 hour
   
4. **Total Tenants Alert** — "Alert when tenants drop (anomaly)"
   - Condition: `value < (previous value - 5% threshold)`
   - Duration: 1 hour

**Time Series:**
5. **MRR Trend Alert** — "Alert if 3 consecutive days below average"
   - Uses 30-day rolling average
   - Fires if 3 consecutive days < 80% of average

#### Panels to Alert On (C4 - Technical Dashboard)

**Stat Cards:**
6. **Error Rate Alert** — "Alert when error rate > 5%"
   - Condition: `value > 5`
   - Duration: 5 minutes
   
7. **5xx Errors Alert** — "Alert when 5xx > 1% (critical)"
   - Condition: `value > 1`
   - Duration: 1 minute (immediate alert)
   
8. **Average Latency Alert** — "Alert when p50 latency > 500ms"
   - Condition: `value > 500`
   - Duration: 5 minutes

9. **Requests/min Alert** — "Alert when RPS drops > 50% from baseline"
   - Condition: `value < (baseline * 0.5)`
   - Duration: 10 minutes

---

### 2️⃣ Notification Channel Setup

#### Option A: Telegram (Recommended)
**Pros:**
- No rate limits like Slack
- Free forever
- Simple HTTP API
- Easy to set up bot

**Steps:**
1. Create Telegram Bot via @BotFather
   - Get bot token
   - Get chat ID

2. In Grafana UI:
   - Admin → Alerting → Notification channels
   - Type: Telegram
   - Bot Token: [from step 1]
   - Chat ID: [from step 1]
   - Test: "Test" button

3. Set as default notification channel for all alerts

#### Option B: Discord (Alternative)
**Pros:**
- Familiar to dev teams
- Channel-based (not DM)
- Threads for organization

**Steps:**
1. Create Discord server/channel
2. Create webhook
   - Server Settings → Webhooks → New Webhook
   - Copy webhook URL

3. In Grafana UI:
   - Admin → Alerting → Notification channels
   - Type: Webhook
   - URL: [webhook URL from step 2]
   - HTTP Method: POST
   - Test button

---

### 3️⃣ Alert Rules Configuration (UI Steps)

#### For Each Alert Rule:

1. **Open Dashboard Panel**
   - Click panel → Edit
   - Go to "Alert" tab
   - Click "Create Alert"

2. **Configure Condition**
   - Query: (already selected from panel)
   - Condition: 
     - `Evaluator:` `is greater than` / `is less than` / `is within range`
     - `Threshold value:` [specific number]
   - Example: MRR alert → `is less than 5000`

3. **Set Evaluation Interval**
   - `For:` How long condition must be true to fire
   - Example: 5 minutes (prevents false positives)

4. **Add Notification Channel**
   - `Send to:` Select Telegram (or Discord)
   - `Message:` Template alert message
   - Example: `{{ .Title }} - {{ .Value }} | Dashboard: {{ .DashboardURL }}`

5. **Name & Save**
   - Alert Name: "MRR Below 5000"
   - Save dashboard

---

## 📊 IMPLEMENTATION ROADMAP

### Timeline: ~4-5 hours total

```
Setup Phase (0.5 hour):
  ├─ 0:15 — Create Telegram bot (or Discord webhook)
  ├─ 0:15 — Add notification channel to Grafana
  └─ 0:05 — Test notification (send test message)

Business Dashboard Alerts (1.5 hours):
  ├─ 0:25 — Alert 1: MRR < 5000
  ├─ 0:25 — Alert 2: Trial→Paid < 50%
  ├─ 0:25 — Alert 3: Churn > 10%
  ├─ 0:25 — Alert 4: Tenants drop alert
  └─ 0:05 — Test all 4 alerts fire

Technical Dashboard Alerts (1.5 hours):
  ├─ 0:20 — Alert 5: Error rate > 5%
  ├─ 0:20 — Alert 6: 5xx errors > 1%
  ├─ 0:20 — Alert 7: Latency > 500ms
  ├─ 0:20 — Alert 8: RPS drop > 50%
  └─ 0:30 — Test all 4 alerts + verify notifications

Validation Phase (1 hour):
  ├─ 0:30 — Manual testing: Trigger each alert
  ├─ 0:20 — Verify Telegram/Discord messages
  └─ 0:10 — Document results

Documentation Phase (1 hour):
  ├─ 0:30 — C5_STATUS_REPORT.md
  ├─ 0:15 — C5_IMPLEMENTATION_SUMMARY.md
  ├─ 0:10 — C5_TESTING_GUIDE.md
  └─ 0:05 — C5_DELIVERY_CHECKLIST.md
```

---

## 🏗️ GRAFANA ALERT FLOW

```
┌─────────────────────────────────┐
│  Grafana Dashboard Panel        │
│  (C3 or C4 query result)        │
└──────────────┬──────────────────┘
               │
               ▼
        ┌────────────────┐
        │ Alert Rule     │
        │ (condition)    │
        │ e.g., MRR < 50 │
        └────────┬───────┘
                 │
        ┌────────▼──────────────┐
        │ Evaluate every 1 min  │
        │ (default interval)    │
        └────────┬──────────────┘
                 │
        ┌────────▼──────────────┐
        │ Is condition true     │
        │ for 5 minutes?        │
        │ (evaluation duration) │
        └────────┬──────────────┘
                 │
           Yes   │   No
        ┌────────┴──────────┐
        ▼                   ▼
    ┌────────┐        ┌──────────┐
    │ FIRING │        │ OK       │
    └───┬────┘        └──────────┘
        │
        ▼
    ┌──────────────────────┐
    │ Send Notification    │
    │ (Telegram/Discord)   │
    └──────────────────────┘
```

---

## 📁 FILES TO CREATE/MODIFY

### NEW Documentation Files (4)
```
docs/observability/
├── C5_STATUS_REPORT.md                      ✅ NEW (exec summary)
├── C5_IMPLEMENTATION_SUMMARY.md             ✅ NEW (technical details)
├── C5_DELIVERY_CHECKLIST.md                 ✅ NEW (alert rules list)
└── C5_TESTING_GUIDE.md                      ✅ NEW (how to test alerts)
```

### MODIFIED Files (1)
```
docs/observability/
└── DELIVERABLES.md                          🔧 Add C5 section
```

### Backend Changes: ZERO ✅
No migrations, no endpoints, no services, no jobs

### Grafana Changes: 8-9 Alert Rules
(Created via UI, not code)

---

## ✅ C5 SIGN-OFF CHECKLIST

### Notification Channel Setup
- [ ] Telegram bot created (or Discord webhook configured)
- [ ] Grafana notification channel added
- [ ] Test notification sends successfully

### Business Dashboard Alerts (C3)
- [ ] MRR < 5000 alert created
- [ ] Trial→Paid < 50% alert created
- [ ] Churn > 10% alert created
- [ ] Tenants drop alert created
- [ ] All 4 alerts configured with Telegram notifications
- [ ] Manual test: All 4 alerts fire correctly

### Technical Dashboard Alerts (C4)
- [ ] Error rate > 5% alert created
- [ ] 5xx errors > 1% alert created
- [ ] Latency > 500ms alert created
- [ ] RPS drop > 50% alert created
- [ ] All 4 alerts configured with Telegram notifications
- [ ] Manual test: All 4 alerts fire correctly

### Documentation
- [ ] C5_STATUS_REPORT.md — Complete
- [ ] C5_IMPLEMENTATION_SUMMARY.md — Complete
- [ ] C5_DELIVERY_CHECKLIST.md — Complete
- [ ] C5_TESTING_GUIDE.md — Complete
- [ ] DELIVERABLES.md — Updated with C5

### Validation
- [ ] Alerts don't fire unnecessarily (false positives checked)
- [ ] Notification channel tested end-to-end
- [ ] Alert messages are clear and actionable
- [ ] Team can access/monitor Telegram/Discord channel
- [ ] No backend changes introduced (C1-C2 untouched)

---

## 🎯 SUCCESS CRITERIA

**C5 is complete when:**
1. ✅ 8+ alert rules created in Grafana (C3: 4, C4: 4+)
2. ✅ Notification channel (Telegram or Discord) configured
3. ✅ All alerts tested and fire correctly
4. ✅ Team receives notifications when thresholds breach
5. ✅ Documentation complete and clear
6. ✅ C1-C4 documentation untouched
7. ✅ Zero backend changes

---

## 📞 NEXT STEPS (READY FOR IMPLEMENTATION)

**C5 Implementation can start immediately:**
1. Create Telegram bot / Discord webhook
2. Configure notification channel in Grafana
3. Create 8+ alert rules (via Grafana UI)
4. Test each alert
5. Write documentation

**No backend work required. No database changes. No code deployments.**

---

**Prepared by:** Claude Code (Corrected Analysis)  
**Date:** 2026-07-04  
**Status:** ✅ ANALYSIS COMPLETE - READY FOR GRAFANA IMPLEMENTATION  
**Next:** Start Grafana alert configuration
