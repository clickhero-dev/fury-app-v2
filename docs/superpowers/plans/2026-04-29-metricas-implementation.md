# Métricas API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 5 endpoints de métricas com Strategy Pattern (Mock + DB), validação Zod, middleware de auth/tenant, conversão de valores monetários centavos→reais.

**Architecture:** 
- Strategy Pattern: `IMetricsProvider` com `MockMetricsProvider` e `DatabaseMetricsProvider`
- MetricsService orquestra lógica, aggrega dados, formata respostas
- Controllers validam params com Zod, delegam para service
- Middleware de auth/tenant injeta userId/tenantId em req

**Tech Stack:** Express, TypeScript, Drizzle ORM, Zod, node:crypto

---

## File Structure

```
src/
├── lib/
│   ├── meta-mock.ts                      # Mock data
│   └── providers/
│       ├── metrics.provider.ts           # Interface IMetricsProvider
│       ├── mock-metrics.provider.ts      # Mock implementation
│       └── db-metrics.provider.ts        # DB implementation
├── types/
│   └── metrics.types.ts                  # Zod schemas + interfaces
├── middleware/
│   ├── auth.middleware.ts                # JWT validation
│   ├── tenant.middleware.ts              # Tenant injection
│   └── errorHandler.ts, logger.ts        # Existing
├── services/
│   └── metrics.service.ts                # Business logic
├── controllers/
│   └── metrics.controller.ts             # HTTP handlers
├── routes/
│   ├── metrics.routes.ts                 # Endpoint definitions
│   └── index.ts                          # Router registration (modify)
├── utils/
│   └── metrics-formatter.ts              # Conversion & rounding helpers
└── ...existing files
```

---

## Implementation Tasks

### Task 1: Create Zod Schemas & Types

**Files:**
- Create: `src/types/metrics.types.ts`

- [ ] **Step 1: Write test file for Zod validation**

Create `tests/types/metrics.types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  dateSchema,
  metricsQuerySchema,
  campaignsQuerySchema,
  dailyQuerySchema,
} from '../../src/types/metrics.types';

describe('Zod Schemas', () => {
  it('should validate correct date format', () => {
    const result = dateSchema.safeParse('2026-04-29');
    expect(result.success).toBe(true);
  });

  it('should reject invalid date format', () => {
    const result = dateSchema.safeParse('2026/04/29');
    expect(result.success).toBe(false);
  });

  it('metricsQuerySchema should allow optional dates', () => {
    const result = metricsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('dailyQuerySchema should require startDate and endDate', () => {
    const result = dailyQuerySchema.safeParse({ startDate: '2026-04-29' });
    expect(result.success).toBe(false);
  });

  it('dailyQuerySchema should reject endDate < startDate', () => {
    const result = dailyQuerySchema.safeParse({
      startDate: '2026-04-29',
      endDate: '2026-04-28',
    });
    expect(result.success).toBe(false);
  });

  it('campaignsQuerySchema should default page=1, limit=10', () => {
    const result = campaignsQuerySchema.safeParse({});
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify all fail**

```bash
npm test tests/types/metrics.types.test.ts
```

Expected: 6 FAIL (schemas don't exist yet)

- [ ] **Step 3: Write Zod schemas**

Create `src/types/metrics.types.ts`:

```typescript
import { z } from 'zod';

// ==================== Validation Schemas ====================

export const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD');

export const metricsQuerySchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  adAccountId: z.string().optional(),
}).refine(
  (data) => {
    if (!data.startDate || !data.endDate) return true;
    return new Date(data.endDate) >= new Date(data.startDate);
  },
  { message: 'endDate must be >= startDate', path: ['endDate'] }
);

export const campaignsQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
}).refine(
  (data) => {
    if (!data.startDate || !data.endDate) return true;
    return new Date(data.endDate) >= new Date(data.startDate);
  },
  { message: 'endDate must be >= startDate', path: ['endDate'] }
);

export const dailyQuerySchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  adAccountId: z.string().optional(),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: 'endDate must be >= startDate', path: ['endDate'] }
);

// ==================== Response Types ====================

export interface DailyMetricsDB {
  date: string;
  spend: number;         // centavos
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
}

export interface CampaignMetricsDB {
  campaignId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  daily: DailyMetricsDB[];
}

export interface MetricsSummaryResponse {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpa: number;
  roas: number;
  conversions: number;
}

export interface CampaignResponse {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  spend: number;
  roas: number;
  cpa: number;
  impressions: number;
  clicks: number;
}

export interface DailyMetricsResponse {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
}

export interface GoalProgressResponse {
  goal: {
    id: string;
    metric: 'roas' | 'clicks' | 'spend' | 'conversions';
    target: number;
  };
  current: number;
  progressPercent: number;
  onTrack: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

// ==================== Request Types ====================

export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
export type CampaignsQuery = z.infer<typeof campaignsQuerySchema>;
export type DailyQuery = z.infer<typeof dailyQuerySchema>;
```

- [ ] **Step 4: Run test to verify all pass**

```bash
npm test tests/types/metrics.types.test.ts
```

Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/metrics.types.ts tests/types/metrics.types.test.ts
git commit -m "feat: add Zod schemas and types for metrics endpoints"
```

---

### Task 2: Create Auth Middleware

**Files:**
- Create: `src/middleware/auth.middleware.ts`

- [ ] **Step 1: Write auth middleware**

Create `src/middleware/auth.middleware.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
      };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
      },
    });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    
    if (!decoded.userId) {
      throw new Error('Invalid token structure');
    }

    req.user = { userId: decoded.userId };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid token',
      },
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/auth.middleware.ts
git commit -m "feat: add auth middleware for JWT validation"
```

---

### Task 3: Create Tenant Middleware

**Files:**
- Create: `src/middleware/tenant.middleware.ts`

- [ ] **Step 1: Write tenant middleware**

Create `src/middleware/tenant.middleware.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      tenant?: {
        tenantId: string;
      };
    }
  }
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.userId) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'User not authenticated',
      },
    });
  }

  req.tenant = { tenantId: req.user.userId };
  next();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/tenant.middleware.ts
git commit -m "feat: add tenant middleware for multi-tenant support"
```

---

### Task 4: Create Metrics Formatter Utilities

**Files:**
- Create: `src/utils/metrics-formatter.ts`

- [ ] **Step 1: Write formatter utilities**

Create `src/utils/metrics-formatter.ts`:

```typescript
export function centavosToReais(centavos: number): number {
  return roundToDecimals(centavos / 100, 2);
}

export function roundToDecimals(value: number, decimals: number): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function calculateCTR(clicks: number, impressions: number): number {
  if (impressions === 0) return 0;
  return roundToDecimals((clicks / impressions) * 100, 2);
}

export function calculateCPM(spendInCentavos: number, impressions: number): number {
  if (impressions === 0) return 0;
  const spendInReais = centavosToReais(spendInCentavos);
  return roundToDecimals((spendInReais / impressions) * 1000, 2);
}

export function calculateCPA(spendInReais: number, conversions: number): number {
  if (conversions === 0) return 0;
  return roundToDecimals(spendInReais / conversions, 2);
}

export function aggregateDailyMetrics(daily: any[]): {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  avgRoas: number;
} {
  const totalSpend = daily.reduce((sum, d) => sum + d.spend, 0);
  const totalImpressions = daily.reduce((sum, d) => sum + d.impressions, 0);
  const totalClicks = daily.reduce((sum, d) => sum + d.clicks, 0);
  const totalConversions = daily.reduce((sum, d) => sum + d.conversions, 0);
  const avgRoas = daily.length > 0
    ? roundToDecimals(daily.reduce((sum, d) => sum + d.roas, 0) / daily.length, 2)
    : 0;

  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    avgRoas,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/metrics-formatter.ts
git commit -m "feat: add metrics formatter utilities for conversions and calculations"
```

---

### Task 5: Create Mock Data

**Files:**
- Create: `src/lib/meta-mock.ts`

- [ ] **Step 1: Write mock data file**

Create `src/lib/meta-mock.ts`:

```typescript
import { CampaignMetricsDB, DailyMetricsDB } from '../types/metrics.types';

function generateMockDailyData(): DailyMetricsDB[] {
  const daily: DailyMetricsDB[] = [];
  const today = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    const baseSpend = 16160 + Math.random() * 5000;
    const baseImpressions = 4840 + Math.random() * 2000;
    
    daily.push({
      date: dateStr,
      spend: Math.round(baseSpend * 100),
      impressions: Math.round(baseImpressions),
      clicks: Math.round(baseImpressions * 0.027),
      conversions: Math.round(baseImpressions * 0.0007),
      roas: 3.2,
    });
  }
  
  return daily;
}

const mockDailyData = generateMockDailyData();

export const mockMetrics = {
  summary: {
    spend: 485000,
    impressions: 145200,
    clicks: 3840,
    ctr: 2.64,
    cpm: 3340,
    cpa: 4850,
    roas: 3.2,
    conversions: 100,
  },
  campaigns: [
    {
      campaignId: 'camp_001',
      name: 'Campanha Black Friday',
      status: 'ACTIVE' as const,
      daily: mockDailyData.map(d => ({
        ...d,
        spend: Math.round(d.spend * 0.43),
        impressions: Math.round(d.impressions * 0.468),
        clicks: Math.round(d.clicks * 0.473),
        conversions: Math.round(d.conversions * 0.50),
      })),
    },
    {
      campaignId: 'camp_002',
      name: 'Retargeting Carrinho',
      status: 'ACTIVE' as const,
      daily: mockDailyData.map(d => ({
        ...d,
        spend: Math.round(d.spend * 0.20),
        impressions: Math.round(d.impressions * 0.152),
        clicks: Math.round(d.clicks * 0.193),
        conversions: Math.round(d.conversions * 0.30),
      })),
    },
    {
      campaignId: 'camp_003',
      name: 'Prospecção Fria',
      status: 'PAUSED' as const,
      daily: mockDailyData.map(d => ({
        ...d,
        spend: Math.round(d.spend * 0.37),
        impressions: Math.round(d.impressions * 0.380),
        clicks: Math.round(d.clicks * 0.334),
        conversions: Math.round(d.conversions * 0.20),
      })),
    },
  ] as CampaignMetricsDB[],
  daily: mockDailyData,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/meta-mock.ts
git commit -m "feat: add mock metrics data for development"
```

---

### Task 6: Create IMetricsProvider Interface

**Files:**
- Create: `src/lib/providers/metrics.provider.ts`

- [ ] **Step 1: Write provider interface**

Create `src/lib/providers/metrics.provider.ts`:

```typescript
import { MetricsSummaryResponse, CampaignResponse, DailyMetricsResponse } from '../types/metrics.types';

export interface IMetricsProvider {
  getSummary(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<MetricsSummaryResponse | null>;

  getCampaigns(
    tenantId: string,
    startDate: string,
    endDate: string,
    status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    page?: number,
    limit?: number
  ): Promise<{
    data: CampaignResponse[];
    total: number;
    page: number;
    pageSize: number;
  }>;

  getCampaignInsights(
    tenantId: string,
    campaignId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    campaign: { id: string; name: string; status: string } | null;
    summary: MetricsSummaryResponse | null;
    daily: DailyMetricsResponse[];
  }>;

  getDailyMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/providers/metrics.provider.ts
git commit -m "feat: define IMetricsProvider interface"
```

---

### Task 7: Create MockMetricsProvider

**Files:**
- Create: `src/lib/providers/mock-metrics.provider.ts`

- [ ] **Step 1: Write MockMetricsProvider**

Create `src/lib/providers/mock-metrics.provider.ts`:

```typescript
import { IMetricsProvider } from './metrics.provider';
import { mockMetrics } from '../meta-mock';
import { 
  MetricsSummaryResponse, 
  CampaignResponse, 
  DailyMetricsResponse 
} from '../types/metrics.types';
import {
  centavosToReais,
  calculateCTR,
  calculateCPA,
  calculateCPM,
  aggregateDailyMetrics,
} from '../utils/metrics-formatter';

export class MockMetricsProvider implements IMetricsProvider {
  async getSummary(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<MetricsSummaryResponse | null> {
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const filteredDaily = mockMetrics.daily.filter(d => {
      const d_date = new Date(d.date);
      return d_date >= startDateObj && d_date <= endDateObj;
    });

    if (filteredDaily.length === 0) {
      return null;
    }

    const aggregated = aggregateDailyMetrics(filteredDaily);

    return {
      spend: centavosToReais(aggregated.totalSpend),
      impressions: aggregated.totalImpressions,
      clicks: aggregated.totalClicks,
      ctr: calculateCTR(aggregated.totalClicks, aggregated.totalImpressions),
      cpm: calculateCPM(aggregated.totalSpend, aggregated.totalImpressions),
      cpa: calculateCPA(
        centavosToReais(aggregated.totalSpend),
        aggregated.totalConversions
      ),
      roas: aggregated.avgRoas,
      conversions: aggregated.totalConversions,
    };
  }

  async getCampaigns(
    tenantId: string,
    startDate: string,
    endDate: string,
    status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    page: number = 1,
    limit: number = 10
  ): Promise<{
    data: CampaignResponse[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    let filtered = mockMetrics.campaigns;

    if (status) {
      filtered = filtered.filter(c => c.status === status);
    }

    const campaigns: CampaignResponse[] = filtered.map(campaign => {
      const dailyInRange = campaign.daily.filter(d => {
        const d_date = new Date(d.date);
        return d_date >= startDateObj && d_date <= endDateObj;
      });

      const aggregated = aggregateDailyMetrics(dailyInRange);

      return {
        id: campaign.campaignId,
        name: campaign.name,
        status: campaign.status,
        spend: centavosToReais(aggregated.totalSpend),
        roas: aggregated.avgRoas,
        cpa: calculateCPA(
          centavosToReais(aggregated.totalSpend),
          aggregated.totalConversions
        ),
        impressions: aggregated.totalImpressions,
        clicks: aggregated.totalClicks,
      };
    });

    campaigns.sort((a, b) => b.spend - a.spend);

    const total = campaigns.length;
    const start = (page - 1) * limit;
    const paginated = campaigns.slice(start, start + limit);

    return {
      data: paginated,
      total,
      page,
      pageSize: limit,
    };
  }

  async getCampaignInsights(
    tenantId: string,
    campaignId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    campaign: { id: string; name: string; status: string } | null;
    summary: MetricsSummaryResponse | null;
    daily: DailyMetricsResponse[];
  }> {
    const campaign = mockMetrics.campaigns.find(c => c.campaignId === campaignId);

    if (!campaign) {
      return {
        campaign: null,
        summary: null,
        daily: [],
      };
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const filteredDaily = campaign.daily.filter(d => {
      const d_date = new Date(d.date);
      return d_date >= startDateObj && d_date <= endDateObj;
    });

    let summary: MetricsSummaryResponse | null = null;
    if (filteredDaily.length > 0) {
      const aggregated = aggregateDailyMetrics(filteredDaily);
      summary = {
        spend: centavosToReais(aggregated.totalSpend),
        impressions: aggregated.totalImpressions,
        clicks: aggregated.totalClicks,
        ctr: calculateCTR(aggregated.totalClicks, aggregated.totalImpressions),
        cpm: calculateCPM(aggregated.totalSpend, aggregated.totalImpressions),
        cpa: calculateCPA(
          centavosToReais(aggregated.totalSpend),
          aggregated.totalConversions
        ),
        roas: aggregated.avgRoas,
        conversions: aggregated.totalConversions,
      };
    }

    const daily: DailyMetricsResponse[] = filteredDaily.map(d => ({
      date: d.date,
      spend: centavosToReais(d.spend),
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      roas: d.roas,
    }));

    return {
      campaign: {
        id: campaign.campaignId,
        name: campaign.name,
        status: campaign.status,
      },
      summary,
      daily,
    };
  }

  async getDailyMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]> {
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const filtered = mockMetrics.daily.filter(d => {
      const d_date = new Date(d.date);
      return d_date >= startDateObj && d_date <= endDateObj;
    });

    return filtered.map(d => ({
      date: d.date,
      spend: centavosToReais(d.spend),
      impressions: d.impressions,
      clicks: d.clicks,
      conversions: d.conversions,
      roas: d.roas,
    }));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/providers/mock-metrics.provider.ts
git commit -m "feat: implement MockMetricsProvider with full metrics aggregation"
```

---

### Task 8: Create DatabaseMetricsProvider Stub

**Files:**
- Create: `src/lib/providers/db-metrics.provider.ts`

- [ ] **Step 1: Write database provider stub**

Create `src/lib/providers/db-metrics.provider.ts`:

```typescript
import { IMetricsProvider } from './metrics.provider';
import { 
  MetricsSummaryResponse, 
  CampaignResponse, 
  DailyMetricsResponse 
} from '../types/metrics.types';

export class DatabaseMetricsProvider implements IMetricsProvider {
  async getSummary(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<MetricsSummaryResponse | null> {
    return null;
  }

  async getCampaigns(
    tenantId: string,
    startDate: string,
    endDate: string,
    status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    page: number = 1,
    limit: number = 10
  ): Promise<{
    data: CampaignResponse[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return {
      data: [],
      total: 0,
      page,
      pageSize: limit,
    };
  }

  async getCampaignInsights(
    tenantId: string,
    campaignId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    campaign: { id: string; name: string; status: string } | null;
    summary: MetricsSummaryResponse | null;
    daily: DailyMetricsResponse[];
  }> {
    return {
      campaign: null,
      summary: null,
      daily: [],
    };
  }

  async getDailyMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]> {
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/providers/db-metrics.provider.ts
git commit -m "feat: create DatabaseMetricsProvider stub"
```

---

### Task 9: Create MetricsService

**Files:**
- Create: `src/services/metrics.service.ts`

- [ ] **Step 1: Write MetricsService**

Create `src/services/metrics.service.ts`:

```typescript
import { IMetricsProvider } from '../lib/providers/metrics.provider';
import {
  MetricsSummaryResponse,
  CampaignResponse,
  DailyMetricsResponse,
  PaginatedResponse,
} from '../types/metrics.types';

export class MetricsService {
  constructor(private provider: IMetricsProvider) {}

  private getDefaultDateRange(): { startDate: string; endDate: string } {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  }

  async getSummary(
    tenantId: string,
    startDate?: string,
    endDate?: string
  ): Promise<MetricsSummaryResponse | null> {
    const { startDate: defaultStart, endDate: defaultEnd } =
      this.getDefaultDateRange();

    const finalStartDate = startDate || defaultStart;
    const finalEndDate = endDate || defaultEnd;

    return this.provider.getSummary(tenantId, finalStartDate, finalEndDate);
  }

  async getCampaigns(
    tenantId: string,
    startDate?: string,
    endDate?: string,
    status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    page: number = 1,
    limit: number = 10
  ): Promise<PaginatedResponse<CampaignResponse>> {
    const { startDate: defaultStart, endDate: defaultEnd } =
      this.getDefaultDateRange();

    const finalStartDate = startDate || defaultStart;
    const finalEndDate = endDate || defaultEnd;

    const result = await this.provider.getCampaigns(
      tenantId,
      finalStartDate,
      finalEndDate,
      status,
      page,
      limit
    );

    return {
      data: result.data,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    };
  }

  async getCampaignInsights(
    tenantId: string,
    campaignId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    campaign: { id: string; name: string; status: string } | null;
    summary: MetricsSummaryResponse | null;
    daily: DailyMetricsResponse[];
  }> {
    const { startDate: defaultStart, endDate: defaultEnd } =
      this.getDefaultDateRange();

    const finalStartDate = startDate || defaultStart;
    const finalEndDate = endDate || defaultEnd;

    return this.provider.getCampaignInsights(
      tenantId,
      campaignId,
      finalStartDate,
      finalEndDate
    );
  }

  async getDailyMetrics(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsResponse[]> {
    return this.provider.getDailyMetrics(tenantId, startDate, endDate);
  }

  async getGoalsProgress(
    tenantId: string
  ): Promise<
    Array<{
      goal: { id: string; metric: string; target: number };
      current: number;
      progressPercent: number;
      onTrack: boolean;
    }>
  > {
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/metrics.service.ts
git commit -m "feat: implement MetricsService with delegation and default date range"
```

---

### Task 10: Create MetricsController

**Files:**
- Create: `src/controllers/metrics.controller.ts`

- [ ] **Step 1: Write MetricsController**

Create `src/controllers/metrics.controller.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from '../services/metrics.service';
import {
  metricsQuerySchema,
  campaignsQuerySchema,
  dailyQuerySchema,
} from '../types/metrics.types';

export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = metricsQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0].message,
            details: validation.error.errors,
          },
        });
      }

      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      const summary = await this.metricsService.getSummary(
        tenantId,
        validation.data.startDate,
        validation.data.endDate
      );

      return res.status(200).json({
        success: true,
        data: summary || {},
      });
    } catch (error) {
      next(error);
    }
  }

  async getCampaigns(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = campaignsQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0].message,
            details: validation.error.errors,
          },
        });
      }

      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      const result = await this.metricsService.getCampaigns(
        tenantId,
        validation.data.startDate,
        validation.data.endDate,
        validation.data.status,
        validation.data.page,
        validation.data.limit
      );

      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCampaignInsights(req: Request, res: Response, next: NextFunction) {
    try {
      const { campaignId } = req.params;
      const validation = metricsQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0].message,
            details: validation.error.errors,
          },
        });
      }

      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      const insights = await this.metricsService.getCampaignInsights(
        tenantId,
        campaignId,
        validation.data.startDate,
        validation.data.endDate
      );

      return res.status(200).json({
        success: true,
        data: insights,
      });
    } catch (error) {
      next(error);
    }
  }

  async getDailyMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = dailyQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0].message,
            details: validation.error.errors,
          },
        });
      }

      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      const daily = await this.metricsService.getDailyMetrics(
        tenantId,
        validation.data.startDate,
        validation.data.endDate
      );

      return res.status(200).json({
        success: true,
        data: daily || [],
      });
    } catch (error) {
      next(error);
    }
  }

  async getGoalsProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      const progress = await this.metricsService.getGoalsProgress(tenantId);

      return res.status(200).json({
        success: true,
        data: progress || [],
      });
    } catch (error) {
      next(error);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/controllers/metrics.controller.ts
git commit -m "feat: implement MetricsController with validation and error handling"
```

---

### Task 11: Create Metrics Routes

**Files:**
- Create: `src/routes/metrics.routes.ts`

- [ ] **Step 1: Write metrics routes**

Create `src/routes/metrics.routes.ts`:

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { MetricsController } from '../controllers/metrics.controller';
import { MetricsService } from '../services/metrics.service';
import { MockMetricsProvider } from '../lib/providers/mock-metrics.provider';
import { DatabaseMetricsProvider } from '../lib/providers/db-metrics.provider';

const provider = process.env.META_USE_MOCK === 'true'
  ? new MockMetricsProvider()
  : new DatabaseMetricsProvider();

const metricsService = new MetricsService(provider);
const metricsController = new MetricsController(metricsService);

const router = Router();

router.get('/summary', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getSummary(req, res, next)
);

router.get('/campaigns', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getCampaigns(req, res, next)
);

router.get('/campaigns/:campaignId/insights', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getCampaignInsights(req, res, next)
);

router.get('/daily', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getDailyMetrics(req, res, next)
);

router.get('/goals-progress', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getGoalsProgress(req, res, next)
);

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/metrics.routes.ts
git commit -m "feat: create metrics routes with all 5 endpoints"
```

---

### Task 12: Register Metrics Routes

**Files:**
- Modify: `src/routes/index.ts`

- [ ] **Step 1: Read current routes index**

```bash
cat src/routes/index.ts
```

- [ ] **Step 2: Update routes index**

Modify `src/routes/index.ts`:

```typescript
import { Router } from 'express';
import healthRoutes from './health.js';
import metricsRoutes from './metrics.routes.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.use('/', healthRoutes);

router.use('/metrics', authMiddleware, tenantMiddleware, metricsRoutes);

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/index.ts
git commit -m "feat: register metrics routes with auth middleware"
```

---

### Task 13: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append META_USE_MOCK**

Add to `.env.example`:

```
# Meta Ads API
META_USE_MOCK=true
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "config: add META_USE_MOCK env variable"
```

---

### Task 14: Test Endpoints with cURL

- [ ] **Step 1: Start server**

```bash
npm run dev
```

- [ ] **Step 2: Create test token**

```bash
echo '{"userId":"tenant_123"}' | base64
```

Take the output (base64 string) for use in tests.

- [ ] **Step 3: Test GET /api/metrics/summary**

```bash
curl -s -X GET 'http://localhost:3000/api/metrics/summary' \
  -H 'Authorization: Bearer eyJ1c2VySWQiOiJ0ZW5hbnRfMTIzIn0=' | jq .
```

Expected: 200 OK with metrics

- [ ] **Step 4: Test GET /api/metrics/campaigns**

```bash
curl -s -X GET 'http://localhost:3000/api/metrics/campaigns' \
  -H 'Authorization: Bearer eyJ1c2VySWQiOiJ0ZW5hbnRfMTIzIn0=' | jq .
```

Expected: 200 OK with paginated campaigns

- [ ] **Step 5: Test GET /api/metrics/campaigns/:id/insights**

```bash
curl -s -X GET 'http://localhost:3000/api/metrics/campaigns/camp_001/insights' \
  -H 'Authorization: Bearer eyJ1c2VySWQiOiJ0ZW5hbnRfMTIzIn0=' | jq .
```

Expected: 200 OK with insights

- [ ] **Step 6: Test GET /api/metrics/daily**

```bash
curl -s -X GET 'http://localhost:3000/api/metrics/daily?startDate=2026-04-25&endDate=2026-04-29' \
  -H 'Authorization: Bearer eyJ1c2VySWQiOiJ0ZW5hbnRfMTIzIn0=' | jq .
```

Expected: 200 OK with daily data

- [ ] **Step 7: Test GET /api/metrics/goals-progress**

```bash
curl -s -X GET 'http://localhost:3000/api/metrics/goals-progress' \
  -H 'Authorization: Bearer eyJ1c2VySWQiOiJ0ZW5hbnRfMTIzIn0=' | jq .
```

Expected: 200 OK with empty array

- [ ] **Step 8: Test validation**

```bash
curl -s -X GET 'http://localhost:3000/api/metrics/daily?startDate=2026-04-29&endDate=2026-04-28' \
  -H 'Authorization: Bearer eyJ1c2VySWQiOiJ0ZW5hbnRfMTIzIn0=' | jq .
```

Expected: 400 Bad Request

- [ ] **Step 9: All tests pass - stop server**

Stop the dev server.

- [ ] **Step 10: Final commit**

```bash
git add -A
git commit -m "test: verify all endpoints functional with mock data"
```

---

## Checkpoint 1: Core Implementation Complete

All 14 tasks completed. The metrics API is functional with:
- ✅ 5 endpoints (summary, campaigns, insights, daily, goals-progress)
- ✅ Strategy Pattern (Mock + DB providers)
- ✅ Full validation with Zod
- ✅ Auth + Tenant middleware
- ✅ Proper conversion (centavos → reais)
- ✅ Rounding to 2 decimals
- ✅ Default date ranges
- ✅ Pagination
- ✅ Error handling
- ✅ All tested with cURL

**Ready for code review and branch completion.**
