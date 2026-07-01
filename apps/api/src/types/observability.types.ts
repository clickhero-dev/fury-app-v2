import { z } from 'zod';

// Query parameters validation
export const kpiQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
  tenantId: z.string().uuid('Invalid tenant UUID').optional(), // For cross-tenant queries
});

export type KPIQueryParams = z.infer<typeof kpiQuerySchema>;

// KPI Response Types
export interface BusinessKPI {
  mrr?: {
    value: number;
    currency: string;
    activeSubscriptions: number;
    period: string;
  };
  trialToPaid?: {
    value: number; // percentage
    trialsInitiated: number;
    conversions: number;
    period: string;
    warning?: string;
  };
  churn?: {
    value: number; // percentage
    churned: number;
    activeAtStart: number;
    period: string;
    warning?: string;
  };
  roas?: {
    value: number;
    spend: number;
    revenue: number;
    campaignsAnalyzed: number;
    warning?: string;
  };
}

export interface TechnicalKPI {
  activeCampaigns?: {
    value: number;
    byTenant: Record<string, number>;
    timestamp: string;
  };
  latency?: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    avgMs: number;
    maxMs: number;
    sampleSize: number;
    period: string;
  };
  errorRate?: {
    value: number; // percentage
    total4xx: number;
    total5xx: number;
    totalRequests: number;
    errorRate4xxPct: number;
    errorRate5xxPct: number;
    period: string;
  };
  rps?: {
    value: number; // requests per second
    totalRequests: number;
    period: string;
    peakMinute?: boolean;
  };
  slowEndpoints?: {
    endpoints: Array<{
      endpoint: string;
      method: string;
      requestCount: number;
      avgResponseTimeMs: number;
      p95ResponseTimeMs: number;
      maxResponseTimeMs: number;
    }>;
    period: string;
    warning?: string;
  };
}

export interface EngagementKPI {
  activeTenants24h?: {
    value: number;
    byHour?: Record<string, number>;
    timestamp: string;
  };
  automations?: {
    createdToday: number;
    activeRules: number;
    executionsToday: number;
    byAction?: Record<string, number>;
    date: string;
  };
  creatives?: {
    generatedToday: number;
    byType?: Record<string, number>;
    byComplianceStatus?: Record<string, number>;
    date: string;
  };
}

export interface KPIResponse {
  success: boolean;
  data?: {
    business?: BusinessKPI;
    technical?: TechnicalKPI;
    engagement?: EngagementKPI;
    requestedAt: string;
    cachedAt?: string;
    ttlSeconds?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Cache key type
export interface CacheKey {
  type: 'all' | 'business' | 'technical' | 'engagement';
  tenantId?: string;
  startDate?: string;
  endDate?: string;
}
