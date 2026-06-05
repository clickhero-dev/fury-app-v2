import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import {
  listStudioAssetsForTenant,
  deleteStudioAsset,
} from '../services/studio.service.js';
import {
  generateImage as generateStudioImage,
  getStudioAssetById,
  publishStudioAssetToMeta,
} from '../services/studio-image.service.js';
import { renderCreative as renderCreativeService } from '../services/studio-render.service.js';

const generateImageSchema = z.object({
  prompt: z.string().min(10, 'Prompt deve ter no minimo 10 caracteres').max(1000, 'Prompt deve ter no maximo 1000 caracteres').optional(),
  briefing: z.string().min(10, 'Briefing deve ter no minimo 10 caracteres').max(1000, 'Briefing deve ter no maximo 1000 caracteres').optional(),
  format: z.enum(['feed', 'stories', 'banner']).optional(),
  style: z.enum(['fotografico', 'ilustracao', 'minimalista']).optional(),
  adAccountId: z.string().min(1, 'adAccountId e obrigatorio').optional(),
}).refine((value) => Boolean(value.prompt?.trim() || value.briefing?.trim()), {
  message: 'Prompt da imagem e obrigatorio.',
  path: ['prompt'],
});

const publishAssetSchema = z.object({
  adAccountId: z.string().min(1, 'adAccountId e obrigatorio').optional(),
});

export async function generateImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const body = generateImageSchema.parse(req.body);
    const prompt = (body.prompt || body.briefing || '').trim();
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

    const result = await generateStudioImage(prompt, req.tenant.tenantId, publicBaseUrl);

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

export async function getAsset(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const assetId = z.string().min(1).parse(req.params.assetId);
    const result = await getStudioAssetById({
      tenantId: req.tenant.tenantId,
      assetId,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getComplianceStatus(req: Request, res: Response, next: NextFunction) {
  return getAsset(req, res, next);
}

export async function publishAsset(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const assetId = z.string().min(1).parse(req.params.assetId);
    const body = publishAssetSchema.parse(req.body);

    const result = await publishStudioAssetToMeta({
      tenantId: req.tenant.tenantId,
      assetId,
      adAccountId: body.adAccountId,
    });

    return res.status(200).json({
      hash: result.hash,
      imageUrl: result.imageUrl,
      metaAssetId: result.metaAssetId,
      adsManagerUrl: result.adsManagerUrl,
    });
  } catch (error) {
    next(error);
  }
}

const renderCreativeSchema = z.object({
  headline: z.string().min(1, 'Headline é obrigatória').max(80, 'Máximo 80 caracteres'),
  cta: z.string().min(1, 'CTA é obrigatório').max(40, 'Máximo 40 caracteres'),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida (use #RRGGBB)').default('#E8631A'),
  imageUrl: z.string().min(1, 'Imagem do produto é obrigatória'),
});

export async function renderCreative(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const body = renderCreativeSchema.parse(req.body);
    const result = await renderCreativeService({
      tenantId: req.tenant.tenantId,
      headline: body.headline,
      cta: body.cta,
      brandColor: body.brandColor,
      imageUrl: body.imageUrl,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    next(error);
  }
}

export async function deleteAsset(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const assetId = z.string().min(1).parse(req.params.assetId);
    await deleteStudioAsset({ tenantId: req.tenant.tenantId, assetId });

    return res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function uploadToMeta(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }

    const body = uploadToMetaSchema.parse(req.body);

    const result = await publishStudioAssetToMeta({
      tenantId: req.tenant.tenantId,
      assetId: body.creativeAssetId,
      adAccountId: body.adAccountId,
    });

    return res.status(200).json({ success: true, metaAssetId: result.metaAssetId, hash: result.hash });
  } catch (error) {
    next(error);
  }
}