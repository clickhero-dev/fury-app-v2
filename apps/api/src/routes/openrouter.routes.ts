import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db, creativeAssets } from '@fury/db';
import { eq } from 'drizzle-orm';
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

// ─── Brand context helper ────────────────────────────────────────
import { tenants, brandKits } from '@fury/db';

const VOICE_TONE_LABELS: Record<string, string> = {
  professional: 'Profissional',
  casual: 'Casual',
  urgent: 'Urgente',
  premium: 'Premium/Sofisticado',
};

async function getBrandContext(tenantId: string): Promise<{
  businessName: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  voiceTone?: string;
}> {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  const brandKit = await db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, tenantId) });

  return {
    businessName: tenant?.name ?? 'Meu Negócio',
    logoUrl: brandKit?.logoUrl ?? undefined,
    primaryColor: brandKit?.primaryColor ?? undefined,
    secondaryColor: brandKit?.secondaryColor ?? undefined,
    voiceTone: brandKit?.voiceTone ? VOICE_TONE_LABELS[brandKit.voiceTone] : undefined,
  };
}

// ─── Enhance prompt (brand + AI improvement) ─────────────────────
const enhancePromptSchema = z.object({
  prompt: z.string().min(3).max(1000),
  type: z.enum(['image', 'video']),
});

router.post('/enhance-prompt', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = enhancePromptSchema.parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;
    const brand = await getBrandContext(tenantId);

    // Build brand context prefix
    const brandParts: string[] = [];
    brandParts.push(`Marca: ${brand.businessName}.`);
    if (brand.voiceTone) brandParts.push(`Tom de comunicação: ${brand.voiceTone}.`);
    if (brand.primaryColor) brandParts.push(`Cor primária: ${brand.primaryColor}.`);
    if (brand.secondaryColor) brandParts.push(`Cor secundária: ${brand.secondaryColor}.`);
    const brandContext = brandParts.join(' ');

    let finalPrompt: string;

    // If prompt is short (< 100 chars), enhance via OpenRouter
    if (body.prompt.length < 100) {
      const typeLabel = body.type === 'video' ? 'vídeo publicitário' : 'imagem publicitária';
      const enhancePrompt = [
        `Você é um especialista em publicidade digital. Melhore o prompt abaixo para gerar um ${typeLabel} profissional.`,
        `Contexto da marca: ${brandContext}`,
        `Adicione detalhes visuais, iluminação, composição, cores da marca e tom de comunicação.`,
        `O prompt melhorado deve ter entre 150 e 400 caracteres e estar em português.`,
        ``,
        `Prompt original: "${body.prompt}"`,
        ``,
        `Retorne APENAS o prompt melhorado, sem aspas, sem introdução.`,
      ].join('\n');

      try {
        const improved = await openrouterService.chat(
          [{ role: 'user', content: enhancePrompt }],
          { temperature: 0.7, max_tokens: 600 },
        );
        finalPrompt = improved.trim();
      } catch {
        // Fallback: use original prompt with brand context
        finalPrompt = `${body.prompt}. ${brandContext}`;
      }
    } else {
      // Prompt is long enough — just prepend brand context
      finalPrompt = `${brandContext} ${body.prompt}`;
    }

    res.json({
      enhancedPrompt: finalPrompt,
      brand: {
        businessName: brand.businessName,
        logoUrl: brand.logoUrl,
        primaryColor: brand.primaryColor,
        voiceTone: brand.voiceTone,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: error.errors });
    next(error);
  }
});

// ─── Generate image (with type in response) ─────────────────────
router.post('/generate-image', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = generateImageSchema.parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || `https://${req.get('host')}`;

    const base64Image = await openrouterService.generateImage({
      model: body.model,
      prompt: body.prompt,
      aspect_ratio: body.aspect_ratio,
      resolution: body.resolution,
    });

    const { fileName } = await saveTemporaryStudioImage(base64Image);
    const imageUrl = `${publicBaseUrl.replace(/\/+$/, '')}/studio-assets/${fileName}`;

    const brand = await getBrandContext(tenantId);
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
          source: 'openrouter-quick-create',
          brand: { businessName: brand.businessName, primaryColor: brand.primaryColor },
        }),
      })
      .returning();

    res.json({
      type: 'image' as const,
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

// ─── Generate video (async polling, with type in response) ───────
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

    const brand = await getBrandContext(tenantId);
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
          source: 'openrouter-quick-create',
          brand: { businessName: brand.businessName, primaryColor: brand.primaryColor },
        }),
      })
      .returning();

    res.json({
      type: 'video' as const,
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

// ─── Regenerate for quick-create assets ──────────────────────────
const regenerateQuickSchema = z.object({
  assetId: z.string().uuid(),
  feedback: z.string().min(3),
});

router.post('/regenerate', authMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = regenerateQuickSchema.parse(req.body);
    const tenantId = (req as any).tenant?.tenantId as string;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || `https://${req.get('host')}`;

    // Look up original asset
    const asset = await db.query.creativeAssets.findFirst({
      where: eq(creativeAssets.id, body.assetId),
    });
    if (!asset || asset.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Asset não encontrado' });
    }

    // Extract original params
    let originalPrompt = '';
    let originalModel = '';
    let assetType: 'image' | 'video' = 'image';
    try {
      const meta = JSON.parse(asset.complianceNotes ?? '{}');
      originalPrompt = meta.prompt ?? '';
      originalModel = meta.model ?? '';
      assetType = asset.type === 'video' ? 'video' : 'image';
    } catch { /* fallback */ }

    if (!originalPrompt || !originalModel) {
      return res.status(400).json({ error: 'Asset original não tem dados suficientes para regeneração' });
    }

    // Enhance the prompt with feedback
    const brand = await getBrandContext(tenantId);
    const enhancePrompt = [
      `Você é um especialista em publicidade digital.`,
      `Prompt original: "${originalPrompt}"`,
      `Feedback do usuário: "${body.feedback}"`,
      `Marca: ${brand.businessName}.`,
      brand.voiceTone ? `Tom: ${brand.voiceTone}.` : '',
      brand.primaryColor ? `Cor primária: ${brand.primaryColor}.` : '',
      ``,
      `Reescreva o prompt incorporando o feedback, mantendo o contexto da marca.`,
      `Retorne APENAS o prompt revisado, sem aspas, sem introdução.`,
    ].filter(Boolean).join('\n');

    let newPrompt: string;
    try {
      newPrompt = (await openrouterService.chat(
        [{ role: 'user', content: enhancePrompt }],
        { temperature: 0.8, max_tokens: 600 },
      )).trim();
    } catch {
      newPrompt = `${originalPrompt}. ${body.feedback}`;
    }

    // Generate new asset
    if (assetType === 'video') {
      const videoUrl = await openrouterService.generateVideo({
        model: originalModel,
        prompt: newPrompt,
        duration: 4,
        resolution: '720p',
        generate_audio: true,
      });

      const [newAsset] = await db.insert(creativeAssets).values({
        tenantId,
        type: 'video',
        url: videoUrl,
        complianceStatus: 'pending_compliance',
        complianceNotes: JSON.stringify({
          prompt: newPrompt,
          model: originalModel,
          generatedAt: new Date().toISOString(),
          source: 'openrouter-regenerate',
          originalAssetId: body.assetId,
          feedback: body.feedback,
        }),
      }).returning();

      return res.json({
        type: 'video' as const,
        assetId: newAsset.id,
        videoUrl,
        creativeData: { headline: '', primary_text: '', cta: '' },
      });
    }

    // Image
    const base64Image = await openrouterService.generateImage({
      model: originalModel,
      prompt: newPrompt,
    });

    const { fileName } = await saveTemporaryStudioImage(base64Image);
    const imageUrl = `${publicBaseUrl.replace(/\/+$/, '')}/studio-assets/${fileName}`;

    const [newAsset] = await db.insert(creativeAssets).values({
      tenantId,
      type: 'image',
      url: imageUrl,
      complianceStatus: 'pending_compliance',
      complianceNotes: JSON.stringify({
        prompt: newPrompt,
        model: originalModel,
        generatedAt: new Date().toISOString(),
        source: 'openrouter-regenerate',
        originalAssetId: body.assetId,
        feedback: body.feedback,
      }),
    }).returning();

    res.json({
      type: 'image' as const,
      assetId: newAsset.id,
      imageUrl,
      creativeData: { headline: '', primary_text: '', cta: '' },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Validation error', details: error.errors });
    next(error);
  }
});

export default router;
