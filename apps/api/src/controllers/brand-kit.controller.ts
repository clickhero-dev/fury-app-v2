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
      if ('error' in result) {
        res.status(400).json({ success: false, message: result.error, timestamp: new Date().toISOString() });
        return;
      }
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