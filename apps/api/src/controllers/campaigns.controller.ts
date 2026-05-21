/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  createCampaign,
  pauseCampaign,
  resumeCampaign,
  updateCampaignBudget,
  getCampaignPanelDetail,
  getCampaigns,
  updateCampaign,
  updateCampaignStatus,
  softDeleteCampaign,
  getCampaignInsights,
} from '../services/campaigns.service.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  getCampaignsCache,
  setCampaignsCache,
  invalidateCampaignsCache,
} from '../lib/campaigns-cache.js';

const createCampaignSchema = z.object({
  name: z.string().min(3, 'Campaign name must be at least 3 characters'),
  objective: z.enum(['OUTCOME_SALES', 'OUTCOME_LEADS', 'OUTCOME_TRAFFIC', 'OUTCOME_AWARENESS']),
  dailyBudget: z.number().int().min(500, 'Minimum budget is R$5.00 (500 cents)'),
  adAccountId: z.string().min(1),
});

const updateBudgetSchema = z.object({
  dailyBudget: z.number().int().min(500, 'Minimum budget is R$5.00 (500 cents)'),
});

export async function createCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createCampaignSchema.parse(req.body);
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const campaign = await createCampaign({
      tenantId,
      ...data,
    });

    res.status(201).json({
      success: true,
      data: campaign,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function pauseCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    if (!id) {
      throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
    }

    await pauseCampaign({ tenantId, campaignId: id });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function resumeCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    if (!id) {
      throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
    }

    await resumeCampaign({ tenantId, campaignId: id });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateBudgetHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateBudgetSchema.parse(req.body);
    const { id } = req.params;
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    if (!id) {
      throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
    }

    const campaign = await updateCampaignBudget({
      tenantId,
      campaignId: id,
      dailyBudget: data.dailyBudget,
    });

    res.json({
      success: true,
      data: campaign,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    if (!id) {
      throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
    }

    const detail = await getCampaignPanelDetail({ tenantId, campaignId: id });

    if (!detail) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    return res.json(detail);
  } catch (err) {
    next(err);
  }
}

const getCampaignsSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function getCampaignsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = getCampaignsSchema.parse(req.query);
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const cacheKey = { tenantId, status: query.status, limit: query.limit, offset: query.offset };
    const cached = await getCampaignsCache(cacheKey);

    if (cached) {
      return res.json({
        success: true,
        data: cached.items,
        pagination: {
          total: cached.total,
          limit: query.limit,
          offset: query.offset,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const result = await getCampaigns({
      tenantId,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });

    await setCampaignsCache(cacheKey, result);

    res.json({
      success: true,
      data: result.items,
      pagination: {
        total: result.total,
        limit: query.limit,
        offset: query.offset,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

const updateCampaignSchema = z.object({
  name: z.string().min(3).optional(),
  budget: z
    .object({
      amount: z.number().int().min(500),
      type: z.enum(['daily', 'lifetime']),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .optional(),
});

export async function updateCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateCampaignSchema.parse(req.body);
    const tenantId = req.tenant?.tenantId || '';

    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    if (!id) {
      throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
    }

    const campaign = await updateCampaign({
      tenantId,
      campaignId: id,
      name: data.name,
      budget: data.budget,
    });

    await invalidateCampaignsCache(tenantId);

    res.json({
      success: true,
      data: campaign,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']),
});

export async function updateCampaignStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = updateStatusSchema.parse(req.body);
    const tenantId = req.tenant?.tenantId || '';
    const userId = (req as any).user?.id || '';

    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    if (!id) {
      throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
    }

    const campaign = await updateCampaignStatus({
      tenantId,
      campaignId: id,
      status: data.status,
      userId,
    });

    await invalidateCampaignsCache(tenantId);

    res.json({
      success: true,
      data: campaign,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function softDeleteCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const tenantId = req.tenant?.tenantId || '';
    const userId = (req as any).user?.id || '';

    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    if (!id) {
      throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
    }

    const campaign = await softDeleteCampaign({
      tenantId,
      campaignId: id,
      userId,
    });

    await invalidateCampaignsCache(tenantId);

    res.json({
      success: true,
      data: campaign,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

const insightsSchema = z.object({
  date_range: z.enum(['last_7d', 'last_30d', 'last_90d', 'custom']).default('last_30d'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export async function getCampaignInsightsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const query = insightsSchema.parse(req.query);
    const tenantId = req.tenant?.tenantId || '';

    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    if (!id) {
      throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
    }

    const insights = await getCampaignInsights({
      tenantId,
      campaignId: id,
      dateRange: query.date_range,
      startDate: query.start_date,
      endDate: query.end_date,
    });

    res.json({
      success: true,
      data: insights,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
