import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BrandKitService } from '../services/brand-kit/brand-kit.service.js';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const upsertBrandKitSchema = z.object({
  primary_color: z.string().regex(HEX_COLOR_REGEX, 'Cor primária inválida. Use o formato #RRGGBB.').optional(),
  secondary_color: z.string().regex(HEX_COLOR_REGEX, 'Cor secundária inválida. Use o formato #RRGGBB.').optional(),
  voice_tone: z.enum(['professional', 'casual', 'urgent', 'premium']).optional(),
  logo_url: z.string().url().nullable().optional(),
  photo_urls: z.array(z.string().url()).optional(),
  whatsapp_number: z.string().regex(/^\d{10,15}$/, 'Número WhatsApp inválido.').nullable().optional(),
});

const deletePhotoSchema = z.object({ url: z.string().url() });

export class BrandKitController {
  constructor(private service: BrandKitService) {}

  chatSnapshot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { res.json({ success: true, data: await this.service.getChatBrand(req.tenant!.tenantId) }); }
    catch (err) { next(err); }
  };

  chatUpdate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = z.object({
        version: z.string().regex(/^(?:\d{1,10}|absent)$/),
        primary_color: z.string().regex(HEX_COLOR_REGEX).optional(),
        secondary_color: z.string().regex(HEX_COLOR_REGEX).optional(),
        voice_tone: z.enum(['professional', 'casual', 'urgent', 'premium']).optional(),
        whatsapp_number: z.string().regex(/^\d{10,15}$/).nullable().optional(),
      }).strict().refine(v => v.primary_color !== undefined || v.secondary_color !== undefined || v.voice_tone !== undefined || v.whatsapp_number !== undefined);
      const payload = body.parse(req.body);
      const values = {
        ...(payload.primary_color !== undefined && { primaryColor: payload.primary_color }),
        ...(payload.secondary_color !== undefined && { secondaryColor: payload.secondary_color }),
        ...(payload.voice_tone !== undefined && { voiceTone: payload.voice_tone }),
        ...(payload.whatsapp_number !== undefined && { whatsappNumber: payload.whatsapp_number }),
      };
      res.json({ success: true, data: await this.service.updateChatBrand(req.tenant!.tenantId, payload.version, values) });
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const brandKit = await this.service.getBrandKit(tenantId);
      if (!brandKit) {
        res.status(404).json({ success: false, message: 'Brand Kit não configurado', timestamp: new Date().toISOString() });
        return;
      }
      res.json({ success: true, data: brandKit, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  upsert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const payload = upsertBrandKitSchema.parse(req.body);
      const values = {
        ...(payload.primary_color !== undefined && { primaryColor: payload.primary_color }),
        ...(payload.secondary_color !== undefined && { secondaryColor: payload.secondary_color }),
        ...(payload.voice_tone !== undefined && { voiceTone: payload.voice_tone }),
        ...(payload.logo_url !== undefined && { logoUrl: payload.logo_url }),
        ...(payload.photo_urls !== undefined && { photoUrls: payload.photo_urls }),
        ...(payload.whatsapp_number !== undefined && { whatsappNumber: payload.whatsapp_number }),
      };
      const data = await this.service.upsertBrandKit(tenantId, values);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  uploadLogo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      if (!req.file) {
        res.status(400).json({ success: false, message: 'Nenhum arquivo enviado', timestamp: new Date().toISOString() });
        return;
      }
      const data = await this.service.uploadLogo(tenantId, { buffer: req.file.buffer, mimetype: req.file.mimetype });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  uploadPhotos = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({ success: false, message: 'Nenhum arquivo enviado', timestamp: new Date().toISOString() });
        return;
      }
      const result = await this.service.uploadPhotos(
        tenantId,
        files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype })),
      );
      res.json({ success: true, data: { urls: result.urls }, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  deletePhoto = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { url } = deletePhotoSchema.parse(req.body);
      const photoUrls = await this.service.deletePhoto(tenantId, url);
      res.json({ success: true, data: { photo_urls: photoUrls }, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };
}
