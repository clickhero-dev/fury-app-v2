import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  createCampaign,
  pauseCampaign,
  resumeCampaign,
  updateCampaignBudget,
  getCampaignPanelDetail,
} from '../services/campaigns.service.js';
import { AppError } from '../middleware/errorHandler.js';

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

    const result = await pauseCampaign({ tenantId, campaignId: id });

    res.json({
      success: true,
      data: result,
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

    const result = await resumeCampaign({ tenantId, campaignId: id });

    res.json({
      success: true,
      data: result,
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
