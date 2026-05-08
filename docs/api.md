# FURY API Documentation - Sprint 1

Complete API reference for the FURY Paid Traffic Automation Platform.

**Base URL:** `http://localhost:3000/api`

**API Version:** 1.0.0

---

## Table of Contents

- [Environment Variables](#environment-variables)
- [Authentication](#authentication)
- [Auth Endpoints](#auth-endpoints)
- [Meta Endpoints](#meta-endpoints)
- [Metrics Endpoints](#metrics-endpoints)
- [Goals Endpoints](#goals-endpoints)
- [Fury Insights Endpoints](#fury-insights-endpoints)
- [Error Codes](#error-codes)

---

## Environment Variables

Required environment variables for API operation:

```env
# Database
DATABASE_URL=postgresql://fury:fury_local@localhost:5432/fury_dev
TEST_DATABASE_URL=postgresql://fury:fury_local@localhost:5432/fury_test

# Redis
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your_secret_key_min_32_chars_required_123456
JWT_REFRESH_SECRET=your_refresh_secret_key_min_32_chars_required_123456

# Server Configuration
PORT=3000
NODE_ENV=development

# Optional
META_USE_MOCK=true  # Use mock data for Meta API (development/testing)
```

---

## Authentication

### Bearer Token

All protected endpoints require a valid JWT access token in the `Authorization` header:

```bash
Authorization: Bearer <accessToken>
```

### Token Expiration

- **Access Token:** 15 minutes
- **Refresh Token:** 30 days

### Token Refresh

When access token expires, use the refresh token to obtain a new access token without re-authenticating.

---

## Auth Endpoints

### POST /auth/register

**Description:** Register a new user and create their tenant

**Authentication:** No

**Request Body:**

```json
{
  "name": "string — Full name (1-255 chars)",
  "email": "string — Valid email address",
  "password": "string — Min 8 chars",
  "companyName": "string — Company name (1-255 chars)"
}
```

**Response 201:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "john@fury.test",
      "role": "owner",
      "tenantId": "uuid",
      "createdAt": "2026-04-30T10:30:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Response 400:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email must be a valid email address"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Response 409:**

```json
{
  "success": false,
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "This email is already registered"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| VALIDATION_ERROR | 400 | Invalid input data |
| EMAIL_EXISTS | 409 | Email already registered |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### POST /auth/login

**Description:** Authenticate user with email and password

**Authentication:** No

**Request Body:**

```json
{
  "email": "string — User email",
  "password": "string — User password"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "john@fury.test",
      "role": "owner",
      "tenantId": "uuid",
      "createdAt": "2026-04-30T10:30:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Response 401:**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| VALIDATION_ERROR | 400 | Invalid input data |
| INVALID_CREDENTIALS | 401 | Email or password incorrect |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### POST /auth/refresh

**Description:** Refresh access token using refresh token

**Authentication:** No

**Request Body:**

```json
{
  "refreshToken": "string — Valid refresh token"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Response 401:**

```json
{
  "success": false,
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Refresh token has expired or is invalid"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| VALIDATION_ERROR | 400 | Invalid refresh token format |
| TOKEN_EXPIRED | 401 | Refresh token expired or revoked |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### GET /auth/me

**Description:** Get authenticated user information

**Authentication:** Yes — Bearer Token

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "john@fury.test",
    "role": "owner",
    "tenantId": "uuid",
    "createdAt": "2026-04-30T10:30:00Z"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Response 401:**

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing authentication token"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Token missing, invalid, or expired |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### POST /auth/logout

**Description:** Logout user and revoke refresh token

**Authentication:** Yes — Bearer Token

**Response 200:**

```json
{
  "success": true,
  "data": null,
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Response 401:**

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing authentication token"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Token missing, invalid, or expired |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

## Meta Endpoints

### POST /meta/connections

**Description:** Create a new Meta (Facebook Ads) connection for the tenant

**Authentication:** Yes — Bearer Token

**Request Body:**

```json
{
  "metaUserId": "string — Meta user ID",
  "accessToken": "string — Meta access token"
}
```

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "metaUserId": "mock_user_001",
    "adAccounts": [
      {
        "id": "act_111111111",
        "name": "Loja Fashion SP Ads",
        "account_status": 1,
        "currency": "BRL"
      }
    ],
    "createdAt": "2026-04-30T10:30:00Z"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Response 400:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid Meta credentials"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| VALIDATION_ERROR | 400 | Invalid input data |
| UNAUTHORIZED | 401 | Invalid authentication |
| INTERNAL_SERVER_ERROR | 500 | Failed to connect to Meta API |

---

### GET /meta/connections

**Description:** List all Meta connections for authenticated tenant

**Authentication:** Yes — Bearer Token

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | integer | Page number (default: 1) |
| limit | integer | Items per page (default: 10, max: 100) |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "connections": [
      {
        "id": "uuid",
        "tenantId": "uuid",
        "metaUserId": "mock_user_001",
        "adAccounts": [
          {
            "id": "act_111111111",
            "name": "Loja Fashion SP Ads",
            "account_status": 1,
            "currency": "BRL"
          }
        ],
        "createdAt": "2026-04-30T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Invalid authentication |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### DELETE /meta/connections/:id

**Description:** Delete a Meta connection

**Authentication:** Yes — Bearer Token

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| id | uuid | Connection ID |

**Response 204:**

```
(No content)
```

**Response 403:**

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to delete this connection"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Response 404:**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Connection not found"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Invalid authentication |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Connection does not exist |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

## Metrics Endpoints

### GET /metrics/summary

**Description:** Get aggregated metrics summary for all campaigns

**Authentication:** Yes — Bearer Token

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| dateFrom | string | Start date (ISO 8601) |
| dateTo | string | End date (ISO 8601) |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "spend": 2100000,
      "impressions": 110000,
      "clicks": 3100,
      "conversions": 107,
      "ctr": 2.82,
      "cpm": 1909,
      "cpa": 431775,
      "roas": 3.8
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Invalid authentication |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### GET /metrics/campaigns

**Description:** Get paginated list of campaigns with metrics

**Authentication:** Yes — Bearer Token

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | integer | Page number (default: 1) |
| limit | integer | Items per page (default: 10, max: 100) |
| status | string | Filter by status (draft, active, paused, archived) |
| sortBy | string | Sort field (name, spend, roas, created_at) |
| sortOrder | string | Sort order (asc, desc) |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "campaigns": [
      {
        "id": "uuid",
        "name": "Campanha Verão 2026",
        "status": "active",
        "metrics": {
          "spend": 21000000,
          "impressions": 68000,
          "clicks": 1820,
          "ctr": 2.68,
          "cpm": 3088,
          "cpa": 420000,
          "roas": 4.1,
          "conversions": 50
        },
        "createdAt": "2026-04-25T14:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 6,
      "pages": 1
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Invalid authentication |
| VALIDATION_ERROR | 400 | Invalid query parameters |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### GET /metrics/goals-progress

**Description:** Get progress towards monthly goals

**Authentication:** Yes — Bearer Token

**Response 200:**

```json
{
  "success": true,
  "data": {
    "progress": {
      "objective": "aumentar_vendas",
      "budget": 500000,
      "spent": 210000,
      "remaining": 290000,
      "progressPercent": 42,
      "roas": 4.1,
      "targetCpa": 500000,
      "currentCpa": 431775,
      "cpaBelowTarget": true
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Invalid authentication |
| NOT_FOUND | 404 | Goals not configured |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### GET /metrics/campaigns/:id

**Description:** Get detailed metrics for a specific campaign

**Authentication:** Yes — Bearer Token

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| id | uuid | Campaign ID |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "campaign": {
      "id": "uuid",
      "name": "Campanha Verão 2026",
      "status": "active",
      "metrics": {
        "spend": 21000000,
        "impressions": 68000,
        "clicks": 1820,
        "ctr": 2.68,
        "cpm": 3088,
        "cpa": 420000,
        "roas": 4.1,
        "conversions": 50,
        "lastUpdated": "2026-04-30T10:00:00Z"
      }
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Invalid authentication |
| NOT_FOUND | 404 | Campaign not found |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

## Goals Endpoints

### POST /goals

**Description:** Create or update client goals for tenant

**Authentication:** Yes — Bearer Token

**Request Body:**

```json
{
  "objective": "string — Goal objective (aumentar_vendas, gerar_leads)",
  "monthlyBudget": {
    "amount": 500000,
    "currency": "BRL"
  },
  "targetCpa": {
    "amount": 500000,
    "currency": "BRL"
  },
  "niche": "string — Business niche"
}
```

**Response 201:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "objective": "aumentar_vendas",
    "monthlyBudget": {
      "amount": 500000,
      "currency": "BRL"
    },
    "targetCpa": {
      "amount": 500000,
      "currency": "BRL"
    },
    "niche": "moda feminina",
    "createdAt": "2026-04-30T10:30:00Z",
    "updatedAt": "2026-04-30T10:30:00Z"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| VALIDATION_ERROR | 400 | Invalid input data |
| UNAUTHORIZED | 401 | Invalid authentication |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### GET /goals

**Description:** Get client goals for authenticated tenant

**Authentication:** Yes — Bearer Token

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "objective": "aumentar_vendas",
    "monthlyBudget": {
      "amount": 500000,
      "currency": "BRL"
    },
    "targetCpa": {
      "amount": 500000,
      "currency": "BRL"
    },
    "niche": "moda feminina",
    "createdAt": "2026-04-30T10:30:00Z",
    "updatedAt": "2026-04-30T10:30:00Z"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Invalid authentication |
| NOT_FOUND | 404 | Goals not found |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

## Fury Insights Endpoints

### GET /fury/insights

**Description:** Get FURY AI-generated suggestions for campaigns

**Authentication:** Yes — Bearer Token

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | integer | Page number (default: 1) |
| limit | integer | Items per page (default: 10, max: 100) |
| priority | string | Filter by priority (low, medium, high) |
| status | string | Filter by status (pending, applied) |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "insights": [
      {
        "id": "uuid",
        "campaignId": "uuid",
        "campaignName": "Prospecção Fria",
        "suggestionType": "campaign_pause",
        "priority": "high",
        "title": "Pausar campanha com CPA acima da meta",
        "description": "A campanha Prospecção Fria está com CPA de R$88,50, 77% acima da meta de R$50,00. Recomendamos pausar para revisar a segmentação.",
        "expectedImpact": "Redução de 15-20% no CPA médio",
        "appliedAt": null,
        "createdAt": "2026-04-28T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 3
    }
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Invalid authentication |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### POST /fury/insights/:id/apply

**Description:** Apply a FURY insight suggestion

**Authentication:** Yes — Bearer Token

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| id | uuid | Insight ID |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "campaignId": "uuid",
    "campaignName": "Prospecção Fria",
    "suggestionType": "campaign_pause",
    "appliedAt": "2026-04-30T10:30:00Z",
    "status": "applied"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Invalid authentication |
| NOT_FOUND | 404 | Insight not found |
| CONFLICT | 409 | Insight already applied |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

### GET /fury/insights/:id

**Description:** Get detailed information about a specific insight

**Authentication:** Yes — Bearer Token

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| id | uuid | Insight ID |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "campaignId": "uuid",
    "campaignName": "Prospecção Fria",
    "suggestionType": "campaign_pause",
    "priority": "high",
    "title": "Pausar campanha com CPA acima da meta",
    "description": "A campanha Prospecção Fria está com CPA de R$88,50, 77% acima da meta de R$50,00. Recomendamos pausar para revisar a segmentação.",
    "expectedImpact": "Redução de 15-20% no CPA médio",
    "suggestionData": {
      "type": "campaign_pause",
      "currentCpa": 8850,
      "targetCpa": 5000,
      "variance": "77%"
    },
    "appliedAt": null,
    "createdAt": "2026-04-28T10:00:00Z"
  },
  "timestamp": "2026-04-30T10:30:00Z"
}
```

**Possible Errors:**

| Code | Status | Reason |
|------|--------|--------|
| UNAUTHORIZED | 401 | Invalid authentication |
| NOT_FOUND | 404 | Insight not found |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

## Error Codes

Standard error codes returned by the API:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Input validation failed |
| UNAUTHORIZED | 401 | Missing or invalid authentication |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource conflict (e.g., duplicate email) |
| EMAIL_EXISTS | 409 | Email already registered |
| INVALID_CREDENTIALS | 401 | Email or password incorrect |
| TOKEN_EXPIRED | 401 | JWT token expired or revoked |
| INTERNAL_SERVER_ERROR | 500 | Server error |

---

## Examples

### Complete Login Flow

```bash
# 1. Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "João Silva",
    "email": "joao@fury.test",
    "password": "Senha@123456",
    "companyName": "Loja Fashion SP"
  }'

# Response
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "123...",
    "email": "joao@fury.test",
    "role": "owner",
    "tenantId": "456..."
  }
}

# 2. Get user info
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJ..."

# 3. Refresh token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJ..."}'

# 4. Logout
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer eyJ..."
```

### Fetch Metrics

```bash
# Get summary
curl http://localhost:3000/api/metrics/summary \
  -H "Authorization: Bearer eyJ..."

# Get campaigns (paginated)
curl http://localhost:3000/api/metrics/campaigns?page=1&limit=10 \
  -H "Authorization: Bearer eyJ..."

# Get goals progress
curl http://localhost:3000/api/metrics/goals-progress \
  -H "Authorization: Bearer eyJ..."
```

---

**Last Updated:** 2026-04-30

**Maintainer:** FURY Development Team
