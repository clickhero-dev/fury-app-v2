/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { uploadAsset } from '../services/storage.service.js';
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
  createCampaignFromWizard,
  searchMetaLocations,
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

const createWizardSchema = z
  .object({
    objective: z.enum(['visits', 'engagement', 'messages', 'whatsapp']),

    creative_asset_id: z.string().min(1).optional(),
    creative_upload_url: z.string().min(1).optional(),
    creative_instagram_media_id: z.string().min(1).optional(),
    creative_media_url: z.string().min(1).optional(),
    headline: z.string().min(1).max(40),
    primary_text: z.string().min(1).max(125),
    destination_url: z.string().regex(/^https?:\/\//, 'URL inválida. Use http:// ou https://').optional(),

    location_city: z.string().min(1),
    location_city_key: z.string().min(1).optional(),
    location_radius_km: z.number().int().refine((v) => [5, 10, 15, 20, 30, 50].includes(v), {
      message: 'Raio inválido. Use 5, 10, 15, 20, 30 ou 50 km.',
    }),
    age_min: z.number().int().min(18).max(65),
    age_max: z.number().int().min(18).max(65),
    gender: z.enum(['all', 'male', 'female']),

    daily_budget_brl: z.number().min(5),
    duration_days: z.number().int().min(1).optional(),

    whatsapp_page_id: z.string().min(1).optional(),
    whatsapp_page_name: z.string().min(1).optional(),
    whatsapp_phone_number_id: z.string().min(1).optional(),
    whatsapp_phone_number: z.string().min(1).optional(),
    destinations: z.array(z.enum(['whatsapp', 'instagram_direct', 'messenger'])).optional(),
    instagram_user_id: z.string().min(1).optional(),
    instagram_username: z.string().min(1).optional(),
  })
  .refine(
    (data) => Boolean(data.creative_asset_id || data.creative_upload_url || data.creative_instagram_media_id),
    {
      message: 'Selecione uma imagem da galeria, envie um arquivo ou escolha um post do Instagram.',
      path: ['creative_asset_id'],
    }
  )
  .refine((data) => data.age_max >= data.age_min, {
    message: 'A idade máxima deve ser maior ou igual à idade mínima.',
    path: ['age_max'],
  })
  .refine((data) => data.objective !== 'visits' || Boolean(data.destination_url), {
    message: 'Informe o link de destino para o objetivo Visitas.',
    path: ['destination_url'],
  })
  .refine(
    (data) => {
      if (data.objective !== 'whatsapp') return true;
      return Boolean(data.whatsapp_page_id) && Boolean(data.destinations && data.destinations.length > 0);
    },
    {
      message: 'Selecione a Página do Facebook e ao menos um destino para receber as mensagens.',
      path: ['whatsapp_page_id'],
    }
  )
  .refine(
    (data) => {
      if (data.objective !== 'whatsapp') return true;
      if (!data.destinations?.includes('whatsapp')) return true;
      return Boolean(data.whatsapp_phone_number_id);
    },
    {
      message: 'Selecione o número de WhatsApp que receberá as mensagens.',
      path: ['whatsapp_phone_number_id'],
    }
  )
  .refine(
    (data) => {
      if (data.objective !== 'whatsapp') return true;
      if (!data.destinations?.includes('instagram_direct')) return true;
      return Boolean(data.instagram_user_id);
    },
    {
      message: 'Conecte uma conta do Instagram à Página no Meta Business para usar Instagram Direct.',
      path: ['instagram_user_id'],
    }
  );

export async function createWizardCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createWizardSchema.parse(req.body);
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const result = await createCampaignFromWizard({
      tenantId,
      objective: data.objective,
      creativeAssetId: data.creative_asset_id,
      creativeUploadUrl: data.creative_upload_url,
      creativeInstagramMediaId: data.creative_instagram_media_id,
      creativeMediaUrl: data.creative_media_url,
      headline: data.headline,
      primaryText: data.primary_text,
      destinationUrl: data.destination_url,
      locationCity: data.location_city,
      locationCityKey: data.location_city_key,
      locationRadiusKm: data.location_radius_km,
      ageMin: data.age_min,
      ageMax: data.age_max,
      gender: data.gender,
      dailyBudgetBrl: data.daily_budget_brl,
      durationDays: data.duration_days,
      whatsappPageId: data.whatsapp_page_id,
      whatsappPageName: data.whatsapp_page_name,
      whatsappPhoneNumberId: data.whatsapp_phone_number_id,
      whatsappPhoneNumber: data.whatsapp_phone_number,
      destinations: data.destinations,
      instagramUserId: data.instagram_user_id,
      instagramUsername: data.instagram_username,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function uploadWizardCreativeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    if (!req.file) {
      throw new AppError(400, 'NO_FILE', 'Nenhum arquivo enviado');
    }

    const extensionByMime: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
    const extension = extensionByMime[req.file.mimetype] ?? 'jpg';
    const fileName = `campaign-wizard/${tenantId}/${randomUUID()}.${extension}`;
    const url = await uploadAsset(req.file.buffer, fileName, req.file.mimetype);

    res.status(201).json({ success: true, data: { url }, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

const metaLocationsSchema = z.object({
  q: z.string().min(2, 'Digite ao menos 2 caracteres'),
});

export async function searchMetaLocationsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = metaLocationsSchema.parse(req.query);
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const results = await searchMetaLocations({ tenantId, query: query.q });

    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
