# C2 Testing Guide - Quick Reference

**Purpose:** Copy-paste commands to test C2 observability endpoints  
**Prerequisites:** Server running on localhost:3000, database populated

---

## 🚀 Quick Start (5 minutes)

### 1. Get Auth Token
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@example.com",
    "password": "password123"
  }' | jq '.data.tokens.accessToken' -r
```

**Save output to variable:**
```bash
export TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"password123"}' \
  | jq -r '.data.tokens.accessToken')

echo $TOKEN  # Verify it's set
```

---

### 2. Test Each Endpoint

#### All KPIs
```bash
curl -X GET "http://localhost:3000/api/observability/kpis" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

**Expected:** All 3 categories (business, technical, engagement)

---

#### Business KPIs Only
```bash
curl -X GET "http://localhost:3000/api/observability/kpis/business" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
```

**Expected:** Only `business` field with MRR, trialToPaid, churn, roas

---

#### Technical KPIs Only
```bash
curl -X GET "http://localhost:3000/api/observability/kpis/technical" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
```

**Expected:** Only `technical` field with latency, errorRate, rps, slowEndpoints

---

#### Engagement KPIs Only
```bash
curl -X GET "http://localhost:3000/api/observability/kpis/engagement" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
```

**Expected:** Only `engagement` field with activeTenants24h, automations, creatives

---

### 3. Test With Date Range
```bash
curl -X GET "http://localhost:3000/api/observability/kpis?startDate=2026-06-01&endDate=2026-06-30" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
```

---

### 4. Test Cache (Run twice, 5 seconds apart)
```bash
# First call (cache miss)
time curl -s -X GET "http://localhost:3000/api/observability/kpis" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.requestedAt'

# Wait 1-2 seconds, then run again (cache hit)
sleep 2
time curl -s -X GET "http://localhost:3000/api/observability/kpis" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.cachedAt'
```

**Expected:** Second call is much faster (~50ms vs 500-2000ms)

---

## 🧪 Comprehensive Test Suite

### Test 1: All endpoints respond
```bash
#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"password123"}' \
  | jq -r '.data.tokens.accessToken')

endpoints=(
  "/api/observability/kpis"
  "/api/observability/kpis/business"
  "/api/observability/kpis/technical"
  "/api/observability/kpis/engagement"
)

for endpoint in "${endpoints[@]}"; do
  echo "Testing $endpoint..."
  curl -s -X GET "http://localhost:3000$endpoint" \
    -H "Authorization: Bearer $TOKEN" \
    | jq -e '.success == true' > /dev/null && echo "✅ PASS" || echo "❌ FAIL"
done
```

---

### Test 2: Error handling
```bash
#!/bin/bash

# Test missing auth header
echo "Test 1: Missing auth header"
curl -s -X GET "http://localhost:3000/api/observability/kpis" \
  | jq '.error.code' -r
# Expected: UNAUTHORIZED

# Test invalid date format
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"password123"}' \
  | jq -r '.data.tokens.accessToken')

echo "Test 2: Invalid date format"
curl -s -X GET "http://localhost:3000/api/observability/kpis?startDate=2026/06/01" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.error.code' -r
# Expected: VALIDATION_ERROR

# Test invalid tenant UUID
echo "Test 3: Invalid tenant UUID"
curl -s -X GET "http://localhost:3000/api/observability/kpis?tenantId=not-a-uuid" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.error.code' -r
# Expected: VALIDATION_ERROR
```

---

### Test 3: Response structure validation
```bash
#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"password123"}' \
  | jq -r '.data.tokens.accessToken')

response=$(curl -s -X GET "http://localhost:3000/api/observability/kpis" \
  -H "Authorization: Bearer $TOKEN")

echo "Checking response structure..."
echo "✓ success field:" $(echo $response | jq '.success')
echo "✓ business KPIs:" $(echo $response | jq '.data.business | keys')
echo "✓ technical KPIs:" $(echo $response | jq '.data.technical | keys')
echo "✓ engagement KPIs:" $(echo $response | jq '.data.engagement | keys')
echo "✓ TTL:" $(echo $response | jq '.data.ttlSeconds')
echo "✓ requestedAt:" $(echo $response | jq '.data.requestedAt')
```

---

## 📊 Postman Collection (JSON)

```json
{
  "info": {
    "name": "FURY Observability KPIs",
    "description": "C2 API endpoints for platform observability",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Login",
      "request": {
        "method": "POST",
        "url": "{{BASE_URL}}/api/auth/login",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"email\":\"owner@example.com\",\"password\":\"password123\"}"
        }
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "var jsonData = pm.response.json();",
              "pm.environment.set(\"TOKEN\", jsonData.data.tokens.accessToken);"
            ]
          }
        }
      ]
    },
    {
      "name": "2. All KPIs",
      "request": {
        "method": "GET",
        "url": "{{BASE_URL}}/api/observability/kpis",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{TOKEN}}"
          }
        ]
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('Status is 200', function() {",
              "  pm.response.to.have.status(200);",
              "});",
              "pm.test('Has all 3 categories', function() {",
              "  var jsonData = pm.response.json();",
              "  pm.expect(jsonData.data.business).to.be.an('object');",
              "  pm.expect(jsonData.data.technical).to.be.an('object');",
              "  pm.expect(jsonData.data.engagement).to.be.an('object');",
              "});",
              "pm.test('TTL is 60 seconds', function() {",
              "  var jsonData = pm.response.json();",
              "  pm.expect(jsonData.data.ttlSeconds).to.equal(60);",
              "});"
            ]
          }
        }
      ]
    },
    {
      "name": "3. Business KPIs",
      "request": {
        "method": "GET",
        "url": "{{BASE_URL}}/api/observability/kpis/business",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{TOKEN}}"
          }
        ]
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('Returns only business category', function() {",
              "  var jsonData = pm.response.json();",
              "  pm.expect(jsonData.data.business).to.be.an('object');",
              "  pm.expect(jsonData.data.technical).to.be.undefined;",
              "});"
            ]
          }
        }
      ]
    },
    {
      "name": "4. Technical KPIs",
      "request": {
        "method": "GET",
        "url": "{{BASE_URL}}/api/observability/kpis/technical",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{TOKEN}}"
          }
        ]
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('Returns only technical category', function() {",
              "  var jsonData = pm.response.json();",
              "  pm.expect(jsonData.data.technical).to.be.an('object');",
              "  pm.expect(jsonData.data.business).to.be.undefined;",
              "});"
            ]
          }
        }
      ]
    },
    {
      "name": "5. Engagement KPIs",
      "request": {
        "method": "GET",
        "url": "{{BASE_URL}}/api/observability/kpis/engagement",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{TOKEN}}"
          }
        ]
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('Returns only engagement category', function() {",
              "  var jsonData = pm.response.json();",
              "  pm.expect(jsonData.data.engagement).to.be.an('object');",
              "  pm.expect(jsonData.data.technical).to.be.undefined;",
              "});"
            ]
          }
        }
      ]
    },
    {
      "name": "6. With Date Range",
      "request": {
        "method": "GET",
        "url": "{{BASE_URL}}/api/observability/kpis?startDate=2026-06-01&endDate=2026-06-30",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{TOKEN}}"
          }
        ]
      }
    },
    {
      "name": "7. Error - Missing Auth",
      "request": {
        "method": "GET",
        "url": "{{BASE_URL}}/api/observability/kpis"
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('Returns 401', function() {",
              "  pm.response.to.have.status(401);",
              "});",
              "pm.test('Error code is UNAUTHORIZED', function() {",
              "  var jsonData = pm.response.json();",
              "  pm.expect(jsonData.error.code).to.equal('UNAUTHORIZED');",
              "});"
            ]
          }
        }
      ]
    },
    {
      "name": "8. Error - Invalid Date",
      "request": {
        "method": "GET",
        "url": "{{BASE_URL}}/api/observability/kpis?startDate=2026/06/01",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{TOKEN}}"
          }
        ]
      },
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('Returns 400', function() {",
              "  pm.response.to.have.status(400);",
              "});",
              "pm.test('Error code is VALIDATION_ERROR', function() {",
              "  var jsonData = pm.response.json();",
              "  pm.expect(jsonData.error.code).to.equal('VALIDATION_ERROR');",
              "});"
            ]
          }
        }
      ]
    }
  ],
  "variable": [
    {
      "key": "BASE_URL",
      "value": "http://localhost:3000",
      "type": "string"
    },
    {
      "key": "TOKEN",
      "value": "",
      "type": "string"
    }
  ]
}
```

**How to use:**
1. Open Postman
2. File → Import → Paste above JSON
3. Set environment variable `BASE_URL` to `http://localhost:3000`
4. Run "1. Login" first
5. Run tests 2-8 in sequence

---

## ✅ QA Checklist

- [ ] All 4 endpoints respond with 200 status
- [ ] Business KPIs contain: mrr, trialToPaid, churn, roas
- [ ] Technical KPIs contain: activeCampaigns, latency, errorRate, rps, slowEndpoints
- [ ] Engagement KPIs contain: activeTenants24h, automations, creatives
- [ ] Missing auth header returns 401
- [ ] Invalid date format returns 400 VALIDATION_ERROR
- [ ] Cache hit detected (second request faster)
- [ ] Response includes: success, data, requestedAt, ttlSeconds
- [ ] Warnings included (Trial→Paid, Churn, ROAS warnings)
- [ ] All numeric values are present and valid
- [ ] All strings are properly formatted

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 UNAUTHORIZED | Check token is valid, not expired (7 day TTL) |
| 400 VALIDATION_ERROR | Check date format is YYYY-MM-DD, tenantId is valid UUID |
| 500 Internal Server Error | Check database connection, run `psql -U fury fury_app` |
| Slow responses (>5s) | Database query timeout. Check request_logs size (`SELECT COUNT(*) FROM request_logs;`) |
| Cache not working | Check Redis connection, verify `REDIS_URL` env var set |
| Missing KPI fields | Some KPIs may be null if no data in that period. This is OK. |

---

**Status:** Ready for QA  
**Test Time:** ~15 minutes  
**Success Criteria:** All 4 endpoints return 200 with valid KPI data
