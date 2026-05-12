import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { requestStudioImageGeneration } from '../services/studio.service.js';

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