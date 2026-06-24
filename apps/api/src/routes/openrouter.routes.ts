import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db, creativeAssets } from '@fury/db';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { openrouterService } from '../services/openrouter.service.js';
import { saveTemporaryStudioImage } from '../lib/temp-storage.js';

const router = Router();

// ─── Modelos disponíveis ─────────────────────────────────────────
const IMAGE_MODELS = [
  { id: 'bytedance-seed/seedream-4.5', label: 'Seedream 4.5', description: 'ByteDance — Mais barato ($0.04/img). Bom para alto volume.', category: 'barato', type: 'image' },
  { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B', description: 'Black Forest Labs — Melhor custo-benefício. Rápido e consistente.', category: 'custo-beneficio', type: 'image' },
  { id: 'black-forest-labs/flux.2-max', label: 'FLUX.2 Max', description: 'Black Forest Labs — Máxima qualidade. Ideal para campanhas premium.', category: 'qualidade', type: 'image' },
];

const VIDEO_MODELS = [
  { id: 'google/veo-3.1-lite', label: 'Veo 3.1 Lite', description: 'Google — Mais barato. Clipes 4-8s, 720p/1080p com áudio.', category: 'barato', type: 'video' },
  { id: 'kwaivgi/kling-video-o1', label: 'Kling Video O1', description: 'Kuaishou — Melhor custo-benefício. $0.112/s, cinematográfico.', category: 'custo-beneficio', type: 'video' },
  { id: 'google/veo-3.1', label: 'Veo 3.1', description: 'Google — Máxima qualidade. 1080p, áudio nativo, cenas estendidas. $0.40/s.', category: 'qualidade', type: 'video' },
];

// GET /openrouter/models
router.get('/models', (_req: Request, res: Response) => {
  res.json({ image: IMAGE_MODELS, video: VIDEO_MODELS });
});

// ─── Schemas de validação ────────────────────────────────────────
const generateImageSchema = z.object({
  model: z.enum(['bytedance-seed/seedream-4.5', 'black-forest-labs/flux.2-klein-4b', 'black-forest-labs/flux.2-max']),
  prompt: z.string().min(10).max(1000),
  aspect_ratio: z.enum(['1:1', '16:9', '9:16']).optional().default('1:1'),
  resolution: z.enum(['1K', '2K', '4K']).optional().default('1K'),
});

const generateVideoSchema = z.object({
  model: z.enum(['google/veo-3.1-lite', 'kwaivgi/kling-video-o1', 'google/veo-3.1']),
  prompt: z.string().min(10).max(1000),
  duration: z.number().int().min(3).max(15).optional().default(5),
  resolution: z.enum(['480p', '720p', '1080p']).optional().default('720p'),
  aspect_ratio: z.enum(['16:9', '9:16', '1:1']).optional().default('16:9'),
  generate_audio: z.boolean().optional().default(true),
});

// POST /openrouter/generate-image
router.post('/generate-image', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = generateImageSchema.parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

    const base64Image = await openrouterService.generateImage({
      model: body.model,
      prompt: body.prompt,
      aspect_ratio: body.aspect_ratio,
      resolution: body.resolution,
    });

    const { fileName } = await saveTemporaryStudioImage(base64Image);
    const imageUrl = `${publicBaseUrl.replace(/\/+$/, '')}/studio-assets/${fileName}`;

    const [asset] = await db
      .insert(creativeAssets)
      .values({
        tenantId,
        type: 'image',
        url: imageUrl,
        complianceStatus: 'pending_compliance',
        complianceNotes: JSON.stringify({
          prompt: body.prompt,
          model: body.model,
          generatedAt: new Date().toISOString(),
        }),
      })
      .returning();

    res.json({
      creativeAssetId: asset.id,
      imageUrl,
      model: body.model,
      prompt: body.prompt,
      generatedAt: new Date().toISOString(),
      status: 'pending_compliance' as const,
    });
  } catch (error) {
    next(error);
  }
});

// POST /openrouter/generate-video (async com polling interno)
router.post('/generate-video', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = generateVideoSchema.parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;

    const videoUrl = await openrouterService.generateVideo({
      model: body.model,
      prompt: body.prompt,
      duration: body.duration,
      resolution: body.resolution,
      aspect_ratio: body.aspect_ratio,
      generate_audio: body.generate_audio,
    });

    const [asset] = await db
      .insert(creativeAssets)
      .values({
        tenantId,
        type: 'video',
        url: videoUrl,
        complianceStatus: 'pending_compliance',
        complianceNotes: JSON.stringify({
          prompt: body.prompt,
          model: body.model,
          duration: body.duration,
          generatedAt: new Date().toISOString(),
        }),
      })
      .returning();

    res.json({
      creativeAssetId: asset.id,
      videoUrl,
      model: body.model,
      prompt: body.prompt,
      duration: body.duration,
      generatedAt: new Date().toISOString(),
      status: 'pending_compliance' as const,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
