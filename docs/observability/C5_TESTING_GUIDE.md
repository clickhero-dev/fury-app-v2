# C5 Testing Guide — Grafana Alert Validation

**Sprint:** 5 (Observability KPIs)  
**Purpose:** Verify all C5 alert rules are configured correctly and functioning  
**Time:** ~1-2 hours  
**Platform:** Grafana (http://localhost:3001)  
**Credentials:** admin / estagiario@2026#

---

## 📋 PRE-TEST CHECKLIST

Before starting tests, confirm:

- [ ] Grafana is running (http://localhost:3001 accessible)
- [ ] Business Dashboard (C3) exists and has data
- [ ] Technical Dashboard (C4) exists and has data
- [ ] Telegram bot created (or Discord webhook configured)
- [ ] Telegram notification channel added to Grafana
- [ ] Team Telegram group is ready to receive notifications

---

## 🧪 TEST 1: Verify Notification Channel

### Objective
Confirm Grafana can send messages to Telegram/Discord

### Steps

#### 1a. Navigate to Notification Channel Settings
```
Grafana → Admin (gear icon) → Alerting → Notification channels
```

#### 1b. Verify Telegram Channel
```
Channel name: "Telegram Notifications"
Type: Telegram
Status: Enabled ✓
Test button: Available
```

#### 1c. Send Test Message
```
Click "Test" button
Expected: Telegram message received immediately
Message content: "Test notification from Grafana"
Delivery time: < 5 seconds
```

### Success Criteria
- [x] Test button sends message
- [x] Message appears in Telegram within 5 seconds
- [x] Message format is readable
- [x] No truncation of text

### Troubleshooting
```
If test message doesn't arrive:
1. Verify bot token is correct (check @BotFather)
2. Verify chat ID is correct (should be numeric)
3. Check Grafana logs for errors: Admin → System → Logs
4. Try adding bot to group and getting new chat ID
```

---

## 🧪 TEST 2: Business Alerts (C3 Dashboard)

### Objective
Verify all 4 business alerts are configured and can fire

### Test 2.1: MRR Alert (< 5000 BRL)

#### Setup
```
Dashboard: Click Hero — Business
Panel: MRR (Current Month)
Current Value: ~50,000 BRL (or whatever your data shows)
```

#### Procedure
```
1. Click on MRR panel → "Edit"
2. Scroll to bottom → "Alert" tab
3. Verify: Alert "MRR Below 5000 BRL" exists
4. Check condition: value < 5000
5. Check duration: 5 minutes
6. Check notification: Telegram selected
7. Click "Save" (save dashboard)
```

#### Validation
```
Expected alert state:
- Status: Green (OK) — if current MRR > 5000
- Status: Red (Firing) — if current MRR < 5000
- Message type: ⚠️ WARNING (in Telegram when firing)
```

#### Success Criteria
- [x] Alert exists and is enabled
- [x] Condition shows as "Green" (not firing, since MRR is healthy)
- [x] Alert configuration correct

#### Manual Trigger (Optional)
```
To verify alert actually fires:
1. Edit alert → change threshold to 100000 (extremely high)
2. Wait 5 minutes
3. Check Telegram for alert message
4. Edit alert → restore threshold to 5000
5. Save
```

### Test 2.2: Trial→Paid Alert (< 50%)

#### Procedure
```
1. Open Click Hero — Business dashboard
2. Click on "Trial → Paid (%)" panel → Edit
3. Check Alert tab
4. Verify: Alert "Trial to Paid Below 50%" exists
5. Condition: value < 50
6. Duration: 30 minutes
7. Notification: Telegram
```

#### Success Criteria
- [x] Alert exists and enabled
- [x] Status: Green or Red (depending on data)
- [x] Condition correct (< 50)

### Test 2.3: Churn Alert (> 10%)

#### Procedure
```
1. Open Click Hero — Business dashboard
2. Click on "Churn (%)" panel → Edit
3. Check Alert tab
4. Verify: Alert "High Churn Rate" exists
5. Condition: value > 10
6. Duration: 1 hour
7. Notification: Telegram
```

#### Success Criteria
- [x] Alert exists and enabled
- [x] Status appropriate for current churn rate
- [x] Condition correct (> 10)

### Test 2.4: Tenant Count Anomaly Alert

#### Procedure
```
1. Open Click Hero — Business dashboard
2. Click on "Total Tenants" panel → Edit
3. Check Alert tab
4. Verify: Alert "Unexpected Tenant Drop" exists
5. Condition: Anomaly detection (> 1 std dev)
6. Duration: 1 hour
7. Notification: Telegram
```

#### Success Criteria
- [x] Alert exists and enabled
- [x] Uses anomaly detection (not simple threshold)
- [x] Status: Green (normal) or Red (anomaly detected)

---

## 🧪 TEST 3: Technical Alerts (C4 Dashboard)

### Objective
Verify all 4+ technical alerts are configured and can fire

### Test 3.1: Error Rate Alert (> 5%)

#### Procedure
```
1. Open Click Hero — Technical dashboard
2. Click on "Error Rate (%)" panel → Edit
3. Check Alert tab
4. Verify: Alert "High Error Rate" exists
5. Condition: value > 5
6. Duration: 5 minutes
7. Notification: Telegram
```

#### Success Criteria
- [x] Alert exists and enabled
- [x] Status: Green (assuming error rate < 5%)
- [x] Condition correct

### Test 3.2: 5xx Errors Alert (> 1%) — CRITICAL

#### Procedure
```
1. Open Click Hero — Technical dashboard
2. Click on "5xx Errors" panel → Edit
3. Check Alert tab
4. Verify: Alert "CRITICAL: Server Errors" exists
5. Condition: value > 1
6. Duration: 1 MINUTE (fastest response)
7. Notification: Telegram
8. Message includes: 🚨 CRITICAL
```

#### Critical Validation
```
This is the most important alert!
- Confirm duration is 1 minute (not 5 or 10)
- Confirm message has 🚨 emoji (high severity)
- Confirm message says "IMMEDIATE ACTION REQUIRED"
- Confirm it's your top priority alert
```

#### Success Criteria
- [x] Alert exists with CRITICAL emphasis
- [x] Duration is 1 minute (fastest)
- [x] Message severity is clear
- [x] Status: Green (good, no server errors)

### Test 3.3: Latency Alert (> 500ms)

#### Procedure
```
1. Open Click Hero — Technical dashboard
2. Click on "Average Latency (ms)" panel → Edit
3. Check Alert tab
4. Verify: Alert "Latency Spike" exists
5. Condition: value > 500
6. Duration: 5 minutes
7. Notification: Telegram
```

#### Success Criteria
- [x] Alert exists and enabled
- [x] Status: Green (assuming latency < 500ms)
- [x] Condition correct

### Test 3.4: RPS Drop Alert (> 50% below baseline)

#### Procedure
```
1. Open Click Hero — Technical dashboard
2. Click on "Requests/min" panel → Edit
3. Check Alert tab
4. Verify: Alert "RPS Drop > 50%" exists
5. Condition: value < (baseline * 0.5)
6. Duration: 10 minutes
7. Notification: Telegram
```

#### Success Criteria
- [x] Alert exists and enabled
- [x] Uses baseline calculation (not fixed threshold)
- [x] Status: Green (assuming RPS normal)

---

## 🧪 TEST 4: Alert State Transitions

### Objective
Verify alerts transition between OK → Firing → OK correctly

### Procedure

#### 4a. Identify a Test Alert
```
Choose: MRR Alert (easiest to test)
Current MRR: ~50,000 BRL
Current state: OK (green)
```

#### 4b. Manually Trigger Alert
```
1. Open MRR panel → Edit → Alert
2. Change threshold from 5000 to 100000
3. Click "Save"
4. Grafana will evaluate: 50,000 < 100,000? YES
5. Wait 5 minutes (evaluation duration)
6. Expected: Alert fires, Telegram message sent
```

#### 4c. Monitor Telegram
```
Watch for message:
"🚨 WARNING: MRR dropped below R$ 5,000"
(actually below 100,000 in this test)
Current: 50000
```

#### 4d. Clear Alert
```
1. Edit alert again
2. Restore threshold to 5000
3. Click Save
4. Grafana evaluates: 50,000 < 5000? NO
5. Alert transitions to OK
6. No message sent (correct)
```

### Success Criteria
- [x] Alert fires and sends message within 5 minutes
- [x] Message is readable and includes value
- [x] Alert clears when condition resolved
- [x] No spurious messages during normal operation

---

## 🧪 TEST 5: Multi-Dashboard Alert Coverage

### Objective
Confirm both dashboards have alerts configured

### Checklist

#### Business Dashboard (C3)
- [ ] Dashboard accessible: http://localhost:3001/d/business-kpis
- [ ] Has data (panels show values, not empty)
- [ ] MRR panel exists and has alert
- [ ] Trial→Paid panel exists and has alert
- [ ] Churn panel exists and has alert
- [ ] Total Tenants panel exists and has alert
- [ ] All 4 alerts → Telegram channel

#### Technical Dashboard (C4)
- [ ] Dashboard accessible: http://localhost:3001/d/technical-kpis
- [ ] Has data (panels show values, not empty)
- [ ] Error Rate panel exists and has alert
- [ ] 5xx Errors panel exists and has alert
- [ ] Latency panel exists and has alert
- [ ] Requests/min panel exists and has alert
- [ ] All 4 alerts → Telegram channel

---

## 🧪 TEST 6: Telegram Notification Format

### Objective
Verify alert messages are clear and actionable

### Sample Message Format
```
Alert fires in Telegram:

🚨 WARNING: MRR dropped below R$ 5,000
Current: R$ 4,234.50
Duration: 5 minutes
Dashboard: http://localhost:3001/d/business-kpis

Action:
1. Check recent invoices
2. Verify subscriptions active
3. Contact sales
```

### Validation Checklist
- [ ] Alert emoji clear (🚨, ⚠️, ℹ️)
- [ ] Current value included
- [ ] Dashboard link clickable
- [ ] Message not truncated
- [ ] No error messages
- [ ] Timestamp accurate (or inferred from order)

---

## 🧪 TEST 7: False Positive Check (1 Hour Monitoring)

### Objective
Verify no spurious alerts fire during normal operation

### Procedure

#### Setup
```
Time: 1 hour continuous monitoring
Platform: Leave Grafana + Telegram open
Task: Monitor for unexpected alerts
```

#### Monitoring Steps
```
1. Open both dashboards (C3 + C4) side-by-side
2. Open Telegram to watch for alerts
3. Let system run for 1 hour
4. Note any alerts that fire
5. For each alert: Investigate if legitimate
```

#### Expected Results
```
Scenario A: All alerts OK (no fires)
→ Confirms thresholds are reasonable
→ No false positives

Scenario B: 1-2 legitimate alerts fire
→ Note the metrics and investigate
→ Confirms alert mechanism works
→ Verify resolution clears alert

Scenario C: > 2 spurious alerts
→ Thresholds may be too tight
→ Adjust and re-test
```

### Success Criteria
- [x] No unexpected alerts fire
- [x] Any fired alerts are legitimate
- [x] Alert message is accurate
- [x] System is stable

---

## 🧪 TEST 8: Team Notification Delivery

### Objective
Confirm team members receive and can act on alerts

### Procedure

#### 8a. Notify Team
```
Message to team:
"C5 alerts are live in Telegram group #observability-alerts.
If you see alerts, please acknowledge and investigate."
```

#### 8b. Manual Alert Test
```
1. Trigger one test alert (MRR, for example)
2. Wait for Telegram notification
3. Ask team members: Did you see the alert?
4. Document confirmation
```

#### 8c. Response Documentation
```
For each alert that fires:
- Time fired
- Team member who noticed
- Time to response
- Resolution action
```

### Success Criteria
- [ ] Team receives notification
- [ ] Team acknowledges alert
- [ ] Team understands action to take
- [ ] Response time documented

---

## ✅ POST-TEST VALIDATION

### Checklist
- [ ] All 8 alerts created and enabled
- [ ] Notification channel tested (test message sent)
- [ ] Business alerts (C3) verified: 4/4
- [ ] Technical alerts (C4) verified: 4+/4+
- [ ] Alert state transitions work correctly
- [ ] Telegram messages are clear and formatted well
- [ ] No false positives during 1-hour monitoring
- [ ] Team can access and respond to alerts
- [ ] Critical 5xx alert has fastest duration (1 min)
- [ ] All conditions and thresholds validated

### Sign-Off
```
All tests passed: ______________________ Date: _______
Tester name and team
```

---

## 🔧 TROUBLESHOOTING

### Issue: Alert doesn't fire when condition is true
```
Check:
1. Is alert enabled? (look for green checkmark)
2. Is condition correct? (review evaluator + threshold)
3. Has evaluation duration elapsed? (wait full duration)
4. Is notification channel selected?
5. Check Grafana logs: Admin → System → Logs
```

### Issue: Telegram message not received
```
Check:
1. Is Telegram bot token correct?
2. Is chat ID correct?
3. Try sending test notification first
4. Check Grafana alerting logs
5. Verify Telegram bot is member of group
```

### Issue: Alert fires continuously (no reset)
```
Check:
1. Condition still true? (check dashboard)
2. Is condition ever becoming false?
3. Threshold may be set too low/high
4. Adjust threshold and retest
```

### Issue: False positives (alert fires when shouldn't)
```
Check:
1. Is threshold correct? (validate against historical data)
2. Is evaluation duration long enough?
3. Consider if anomaly is legitimate
4. Adjust threshold and retest
5. May need to exclude certain hours (e.g., maintenance)
```

---

## 📊 TEST REPORT TEMPLATE

```
C5 Alert Testing Report
Date: 2026-07-04
Tester: [Name]
Duration: [Time spent]

NOTIFICATION CHANNEL
- Telegram test: ✅ PASS / ❌ FAIL
- Message format: ✅ PASS / ❌ FAIL

BUSINESS ALERTS (C3)
- MRR alert: ✅ PASS / ❌ FAIL
- Trial→Paid alert: ✅ PASS / ❌ FAIL
- Churn alert: ✅ PASS / ❌ FAIL
- Tenant alert: ✅ PASS / ❌ FAIL

TECHNICAL ALERTS (C4)
- Error rate alert: ✅ PASS / ❌ FAIL
- 5xx alert: ✅ PASS / ❌ FAIL
- Latency alert: ✅ PASS / ❌ FAIL
- RPS alert: ✅ PASS / ❌ FAIL

STATE TRANSITIONS
- OK → Firing: ✅ PASS / ❌ FAIL
- Firing → OK: ✅ PASS / ❌ FAIL

FALSE POSITIVE TEST (1 hour)
- Spurious alerts: 0 / [number]
- Legitimate alerts: [number]
- Result: ✅ PASS / ❌ FAIL

TEAM NOTIFICATION
- Team received alerts: ✅ YES / ❌ NO
- Team understood action: ✅ YES / ❌ NO
- Response time: [minutes]

OVERALL RESULT
✅ PRODUCTION READY / ❌ NEEDS WORK

Issues found:
[List any issues to fix]

Recommended changes:
[List any threshold adjustments or improvements]
```

---

## 📝 NEXT STEPS AFTER TESTING

### If All Tests Pass ✅
```
1. Notify team: "C5 alerts are live and validated"
2. Add to runbooks: "When alert X fires, do Y"
3. Set up on-call rotation to monitor Telegram
4. Document response procedures per alert
5. Schedule alert review in 1 week
```

### If Tests Fail ❌
```
1. Document specific failures
2. Adjust thresholds/conditions
3. Re-run failed tests
4. Repeat until all pass
5. Only then go to production
```

---

**Prepared by:** Claude Code  
**Date:** 2026-07-04  
**Status:** ✅ TESTING GUIDE COMPLETE  
**Next:** Execute tests and document results

---

## Quick Reference: All 8 Alerts at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│ C5 ALERT SUMMARY - QUICK REFERENCE                         │
├─────────────────────────────────────────────────────────────┤
│ BUSINESS ALERTS (C3 Dashboard)                              │
│ 1. MRR < 5000 BRL (5 min)                      ⚠️ WARNING   │
│ 2. Trial→Paid < 50% (30 min)                   ⚠️ WARNING   │
│ 3. Churn > 10% (1 hour)                        ⚠️ WARNING   │
│ 4. Tenant drop anomaly (1 hour)                ⚠️ WARNING   │
│                                                              │
│ TECHNICAL ALERTS (C4 Dashboard)                             │
│ 5. Error rate > 5% (5 min)                     ⚠️ WARNING   │
│ 6. 5xx errors > 1% (1 min)                     🚨 CRITICAL  │
│ 7. Latency > 500ms (5 min)                     ⚠️ WARNING   │
│ 8. RPS drop > 50% (10 min)                     ⚠️ WARNING   │
│                                                              │
│ All alerts → Telegram notifications                         │
│ No backend code changes                                     │
└─────────────────────────────────────────────────────────────┘
```
