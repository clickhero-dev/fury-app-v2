import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import {
  listStudioAssetsForTenant,
  requestStudioImageGeneration,
  uploadCreativeAssetToMeta,
} from '../services/studio.service.js';

const generateImageSchema = z.object({
  briefing: z.string().min(10, 'Briefing deve ter no minimo 10 caracteres').max(500, 'Briefing deve ter no maximo 500 caracteres'),
  format: z.enum(['feed', 'stories', 'banner']),
  style: z.enum(['fotografico', 'ilustracao', 'minimalista']).default('fotografico'),
  adAccountId: z.string().min(1, 'adAccountId e obrigatorio'),
});

export async function generateImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const body = generateImageSchema.parse(req.body);
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

    const result = await requestStudioImageGeneration({
      tenantId: req.tenant.tenantId,
      briefing: body.briefing,
      format: body.format,
      style: body.style,
      adAccountId: body.adAccountId,
      publicBaseUrl,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

const uploadToMetaSchema = z.object({
  creativeAssetId: z.string().min(1, 'creativeAssetId e obrigatorio'),
  adAccountId: z.string().min(1, 'adAccountId e obrigatorio'),
});

const listAssetsQuerySchema = z.object({
  type: z.enum(['image', 'video', 'copy']).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export async function listAssets(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const query = listAssetsQuerySchema.parse(req.query);
    const result = await listStudioAssetsForTenant({
      tenantId: req.tenant.tenantId,
      type: query.type,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
}

export async function uploadToMeta(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const body = uploadToMetaSchema.parse(req.body);

    const result = await uploadCreativeAssetToMeta({
      tenantId: req.tenant.tenantId,
      creativeAssetId: body.creativeAssetId,
      adAccountId: body.adAccountId,
    });

    return res.status(200).json({ success: true, metaAssetId: result.metaAssetId });
  } catch (error) {
    next(error);
  }
}