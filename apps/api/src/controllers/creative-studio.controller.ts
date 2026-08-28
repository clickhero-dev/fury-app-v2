import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StudioService } from '../services/studio/creative-studio.service.js';

const generateCopySchema = z.object({
  type: z.enum(['headline', 'descricao', 'cta', 'completo']),
  produto: z.string().min(3, 'Produto deve ter min 3 caracteres').max(200, 'Produto deve ter max 200 caracteres'),
  publico: z.string().min(5, 'Publico deve ter min 5 caracteres').max(200, 'Publico deve ter max 200 caracteres'),
  objetivo: z.string().min(5, 'Objetivo deve ter min 5 caracteres').max(200, 'Objetivo deve ter max 200 caracteres'),
  tom: z.enum(['formal', 'casual', 'urgente', 'emocional']),
  quantidadeVariacoes: z.number().int().min(3).max(5).default(3),
});

const validateContextSchema = z.object({ product: z.string().min(1), promise: z.string().min(1), offer: z.string().optional(), audience: z.string().min(1) });

const generateCreativeSchema = z.object({
  product: z.string().min(2),
  promise: z.string().min(2),
  offer: z.string().optional(),
  audience: z.string().min(2),
  adaptiveAnswers: z.record(z.string()).optional(),
  layout: z.enum(['editorial_headline', 'offer_burst', 'split_diagonal_product', 'photo_immersive', 'split_horizontal_photo']).optional(),
  headline: z.string().max(120).optional(),
  qualifier: z.string().max(60).optional(),
  offer_text: z.string().max(20).optional(),
  subheadline: z.string().max(160).optional(),
  subtitle: z.string().max(200).optional(),
  subtitle_highlight: z.string().max(30).optional(),
  benefits: z.array(z.string().max(80)).max(4).optional(),
  cta: z.string().max(24).optional(),
  cta_icon: z.enum(['arrow', 'phone', 'whatsapp', 'none']).optional(),
  price_text: z.string().max(20).optional(),
  hasProductImage: z.boolean().default(false),
  background_image_url: z.string().optional(),
  product_image_url: z.string().optional(),
  hero_image_url: z.string().optional(),
  productImageUrl: z.string().optional(),
  tone: z.enum(['institutional', 'energetic']).optional(),
  top_zone_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  highlight_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  includeLogo: z.boolean().optional(),
  skipCopy: z.boolean().optional(),
});

const regenerateCreativeSchema = z.object({ assetId: z.string().uuid(), feedback: z.string().min(1) });

const selectLayoutSchema = z.object({
  product: z.string().min(1),
  promise: z.string().min(1),
  offer: z.string().optional(),
  audience: z.string().min(1),
  objective: z.enum(['awareness', 'consideration', 'conversion', 'content']).optional(),
  hasProductImage: z.boolean().default(false),
  productImageUrl: z.string().optional(),
  background_image_url: z.string().optional(),
});

const previewCreativeSchema = z.object({
  layout: z.enum(['editorial_headline', 'offer_burst', 'split_diagonal_product', 'photo_immersive', 'split_horizontal_photo']),
  headline: z.string().max(120).optional(),
  qualifier: z.string().max(60).optional(),
  offer_text: z.string().max(20).optional(),
  subheadline: z.string().max(160).optional(),
  subtitle: z.string().max(200).optional(),
  subtitle_highlight: z.string().max(30).optional(),
  benefits: z.array(z.string().max(80)).max(4).optional(),
  cta: z.string().max(24).optional(),
  cta_icon: z.enum(['arrow', 'phone', 'whatsapp', 'none']).optional(),
  price_text: z.string().max(20).optional(),
  background_image_url: z.string().optional(),
  product_image_url: z.string().optional(),
  hero_image_url: z.string().optional(),
  productImageUrl: z.string().optional(),
  tone: z.enum(['institutional', 'energetic']).optional(),
  top_zone_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  highlight_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  includeLogo: z.boolean().optional(),
});

export class CreativeStudioController {
  constructor(private service: StudioService) {}

  private zodError(res: Response, err: unknown): boolean {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: (err as z.ZodError).errors });
      return true;
    }
    return false;
  }

  private tenantId(req: Request): string {
    return (req as any).tenant?.tenantId as string;
  }

  generateCopy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = generateCopySchema.parse(req.body);
      const data = await this.service.generateCopyLegacy(body, body.type as any, body.quantidadeVariacoes ?? 3);
      res.json(data);
    } catch (e) { next(e); }
  };

  copyGenerate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = generateCopySchema.parse(req.body);
      const tenantId = this.tenantId(req);
      if (!tenantId) { res.status(401).json({ error: 'Tenant not found' }); return; }
      const input = { objective: (body as any).objetivo, product: (body as any).produto, audience: (body as any).publico, tone: (body as any).tom, quantity: (body as any).quantidadeVariacoes ?? 3 };
      const result = await this.service.generateAdCopy(input as any, tenantId);
      res.status(200).json(result);
    } catch (e) { if (!this.zodError(res, e)) next(e); }
  };

  validateContext = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validateContextSchema.parse(req.body);
      const result = await this.service.validateContext(this.tenantId(req), body);
      res.json(result);
    } catch (e) { if (!this.zodError(res, e)) next(e); }
  };

  generateCreative = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = generateCreativeSchema.parse(req.body);
      const tenantId = this.tenantId(req);
      const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || `https://${req.get('host')}`;
      const result = await this.service.generateCreative(tenantId, body, publicBaseUrl);
      res.status(201).json(result);
    } catch (e) { if (!this.zodError(res, e)) next(e); }
  };

  regenerateCreative = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = regenerateCreativeSchema.parse(req.body);
      const tenantId = this.tenantId(req);
      const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || `https://${req.get('host')}`;
      const result = await this.service.regenerateCreative(tenantId, body, publicBaseUrl);
      res.status(201).json(result);
    } catch (e) { if (!this.zodError(res, e)) next(e); }
  };

  selectLayout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = selectLayoutSchema.parse(req.body);
      const result = await this.service.selectLayoutStandalone(this.tenantId(req), body);
      res.json(result);
    } catch (e) { if (!this.zodError(res, e)) next(e); }
  };

  previewPng = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = previewCreativeSchema.parse(req.body);
      let pngBuffer: Buffer;
      try {
        pngBuffer = await this.service.previewPng(this.tenantId(req), body);
      } catch (renderErr) {
        res.status(422).json({ error: 'preview_unavailable', message: (renderErr as Error).message });
        return;
      }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store');
      res.send(pngBuffer);
    } catch (e) { if (!this.zodError(res, e)) next(e); }
  };
}