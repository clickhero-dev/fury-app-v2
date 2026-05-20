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

export const dailyQuerySchema = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    adAccountId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (data.startDate === undefined || data.startDate.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startDate is required',
        path: ['startDate'],
      });
    } else if (!dateRe.test(data.startDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid date format. Use YYYY-MM-DD',
        path: ['startDate'],
      });
    }

    if (data.endDate === undefined || data.endDate.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate is required',
        path: ['endDate'],
      });
    } else if (!dateRe.test(data.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid date format. Use YYYY-MM-DD',
        path: ['endDate'],
      });
    }

    if (
      data.startDate &&
      data.endDate &&
      dateRe.test(data.startDate) &&
      dateRe.test(data.endDate) &&
      new Date(data.endDate) < new Date(data.startDate)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate must be >= startDate',
        path: ['endDate'],
      });
    }
  })
  .transform((data) => ({
    startDate: data.startDate as string,
    endDate: data.endDate as string,
    adAccountId: data.adAccountId,
  }));

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
  roas: number | null;
  cpa: number | null;
  conversions: number | null;
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

/** Resposta única de progresso de metas (CPA / orçamento mensal no banco). */
export interface GoalsProgressResponse {
  goal: {
    id: string;
    targetCpa: number;
    targetRoas: number | null;
    monthlyBudget: number;
  };
  current: number;
  progressPercent: number;
  onTrack: boolean;
}

export interface CampaignInsightsResponse {
  campaign: {
    id: string;
    name: string;
    status: string;
    objective: string;
  } | null;
  summary: MetricsSummaryResponse | null;
  daily: DailyMetricsResponse[];
  creatives: unknown[];
}

export interface AdsetMetricsResponse {
  spend: number;
  clicks: number;
  ctr: number;
  cpm: number;
}

export interface AdsetResponse {
  id: string;
  name: string;
  status: string;
  dailyBudget: number;
  metrics: AdsetMetricsResponse;
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
