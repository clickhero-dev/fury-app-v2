import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { OpenRouterStudioService } from '../services/openrouter/openrouter-studio.service.js';

const generateImageSchema = z.object({
  model: z.enum(['bytedance-seed/seedream-4.5', 'black-forest-labs/flux.2-klein-4b', 'black-forest-labs/flux.2-max']),
  prompt: z.string().min(10).max(1000),
  aspect_ratio: z.enum(['1:1', '16:9', '9:16']).optional().default('1:1'),
  resolution: z.enum(['1K', '2K', '4K']).optional().default('2K'),
});

const generateVideoSchema = z.object({
  model: z.enum(['google/veo-3.1-lite', 'kwaivgi/kling-video-o1', 'google/veo-3.1']),
  prompt: z.string().min(10).max(1000),
  duration: z.number().int().min(3).max(15).optional().default(4),
  resolution: z.enum(['480p', '720p', '1080p']).optional().default('720p'),
  aspect_ratio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9'),
  generate_audio: z.boolean().optional().default(true),
});

const enhancePromptSchema = z.object({ prompt: z.string().min(3).max(1000), type: z.enum(['image', 'video']) });
const regenerateQuickSchema = z.object({ assetId: z.string().uuid(), feedback: z.string().min(3) });

export class OpenRouterController {
  constructor(private service: OpenRouterStudioService) {}

  private validationError(res: Response, error: unknown): boolean {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return true;
    }
    return false;
  }

  getModels = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { res.json(this.service.getModels()); } catch (e) { next(e); }
  };

  enhancePrompt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = enhancePromptSchema.parse(req.body);
      const tenantId = (req as any).tenant?.tenantId as string;
      const out = await this.service.enhancePrompt(tenantId, body);
      res.json({ enhancedPrompt: out.enhancedPrompt, brand: out.brand });
    } catch (e) { if (!this.validationError(res, e)) next(e); }
  };

  generateImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = generateImageSchema.parse(req.body);
      const tenantId = (req as any).tenant?.tenantId as string;
      const data = await this.service.generateImage(tenantId, body);
      res.json(data);
    } catch (e) { next(e); }
  };

  generateVideo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = generateVideoSchema.parse(req.body);
      const tenantId = (req as any).tenant?.tenantId as string;
      const data = await this.service.generateVideo(tenantId, body);
      res.json(data);
    } catch (e) { next(e); }
  };

  regenerate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = regenerateQuickSchema.parse(req.body);
      const tenantId = (req as any).tenant?.tenantId as string;
      const data = await this.service.regenerate(tenantId, body);
      res.json(data);
    } catch (e) {
      if (!this.validationError(res, e)) next(e);
    }
  };

  regenerateAd = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const maskFile = (req as any).file as Express.Multer.File | undefined;
    try {
      const { assetId, feedback } = req.body as { assetId: string; feedback: string };
      if (!assetId || !feedback || feedback.length < 3) {
        res.status(400).json({ error: 'assetId e feedback são obrigatórios' });
        return;
      }
      const tenantId = (req as any).tenant?.tenantId as string;
      let mask: { buffer: Buffer; mime: string } | undefined;
      if (maskFile?.path) {
        const mime = maskFile.mimetype.includes('png') ? 'image/png' : 'image/jpeg';
        const buf = await readFile(maskFile.path);
        mask = { buffer: buf, mime };
      }
      const data = await this.service.regenerateAd(tenantId, { assetId, feedback, mask });
      res.json(data);
    } catch (e) { next(e); }
  };
}