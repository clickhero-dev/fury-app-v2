import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { StudioPublishingService } from '../services/studio/studio-publishing.service.js';
import { db, brandKits } from '@fury/db';
import { eq } from 'drizzle-orm';

const generateImageSchema = z
  .object({
    prompt: z.string().min(10, 'Prompt deve ter no minimo 10 caracteres').max(1000, 'Prompt deve ter no maximo 1000 caracteres').optional(),
    briefing: z.string().min(10, 'Briefing deve ter no minimo 10 caracteres').max(1000, 'Briefing deve ter no maximo 1000 caracteres').optional(),
    format: z.enum(['feed', 'stories', 'banner']).optional(),
    style: z.enum(['fotografico', 'ilustracao', 'minimalista']).optional(),
    adAccountId: z.string().min(1, 'adAccountId e obrigatorio').optional(),
  })
  .refine((value) => Boolean(value.prompt?.trim() || value.briefing?.trim()), {
    message: 'Prompt da imagem e obrigatorio.',
    path: ['prompt'],
  });

const publishAssetSchema = z.object({
  adAccountId: z.string().min(1, 'adAccountId e obrigatorio').optional(),
});

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

const renderCreativeSchema = z.object({
  headline: z.string().min(1, 'Headline é obrigatória').max(80, 'Máximo 80 caracteres'),
  cta: z.string().min(1, 'CTA é obrigatório').max(40, 'Máximo 40 caracteres'),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida (use #RRGGBB)').default('#E8631A'),
  imageUrl: z.string().min(1, 'Imagem do produto é obrigatória'),
  includeLogo: z.boolean().optional().default(true),
});

export class StudioPublishingController {
  constructor(private service: StudioPublishingService) {}

  private zodError(res: Response, err: unknown): boolean {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return true;
    }
    return false;
  }

  private tenantId(req: Request): string {
    return (req as any).tenant?.tenantId as string;
  }

  generateImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }

      const body = generateImageSchema.parse(req.body);
      const prompt = (body.prompt || body.briefing || '').trim();
      const publicBaseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

      const result = await this.service.generateImage(prompt, tenantId, publicBaseUrl);
      res.status(200).json(result);
    } catch (error) {
      if (!this.zodError(res, error)) next(error);
    }
  };

  listAssets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }

      const query = listAssetsQuerySchema.parse(req.query);
      const [result, quota] = await Promise.all([
        this.service.listStudioAssetsForTenant({
          tenantId,
          type: query.type,
          status: query.status,
          page: query.page,
          limit: query.limit,
        }),
        this.service.getCreativeQuotaSnapshot(tenantId),
      ]);

      res.status(200).json({ ...result, ...quota });
    } catch (error) {
      if (!this.zodError(res, error)) next(error);
    }
  };

  getAsset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }

      const assetId = z.string().min(1).parse(req.params.assetId);
      const result = await this.service.getStudioAssetById({ tenantId, assetId });
      res.status(200).json(result);
    } catch (error) {
      if (!this.zodError(res, error)) next(error);
    }
  };

  getComplianceStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    return this.getAsset(req, res, next);
  };

  publishAsset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }

      const assetId = z.string().min(1).parse(req.params.assetId);
      const body = publishAssetSchema.parse(req.body);

      const result = await this.service.publishAssetToMeta({
        tenantId,
        assetId,
        adAccountId: body.adAccountId,
      });

      res.status(200).json({
        hash: result.hash,
        imageUrl: result.imageUrl,
        metaAssetId: result.metaAssetId,
        adsManagerUrl: result.adsManagerUrl,
      });
    } catch (error) {
      if (!this.zodError(res, error)) next(error);
    }
  };

  renderCreative = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }

      const body = renderCreativeSchema.parse(req.body);

      let logoUrl: string | undefined;
      if (body.includeLogo) {
        const brandKit = await db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, tenantId) });
        logoUrl = brandKit?.logoUrl ?? undefined;
      }

      const result = await this.service.renderCreative({
        tenantId,
        headline: body.headline,
        cta: body.cta,
        brandColor: body.brandColor,
        imageUrl: body.imageUrl,
        logoUrl,
      });

      res.status(200).json(result);
    } catch (error) {
      if (!this.zodError(res, error)) next(error);
    }
  };

  deleteAsset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }

      const assetId = z.string().min(1).parse(req.params.assetId);
      await this.service.deleteStudioAsset({ tenantId, assetId });
      res.status(200).json({ success: true });
    } catch (error) {
      if (!this.zodError(res, error)) next(error);
    }
  };

  uploadToMeta = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.tenantId(req);
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }

      const body = uploadToMetaSchema.parse(req.body);

      const result = await this.service.publishAssetToMeta({
        tenantId,
        assetId: body.creativeAssetId,
        adAccountId: body.adAccountId,
      });

      res.status(200).json({ success: true, metaAssetId: result.metaAssetId, hash: result.hash });
    } catch (error) {
      if (!this.zodError(res, error)) next(error);
    }
  };
}