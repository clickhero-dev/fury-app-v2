import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BrandKitPhotoService, BRAND_KIT_PHOTO_KINDS } from '../services/brand-kit/brand-kit-photo.service.js';

const kindSchema = z.enum(BRAND_KIT_PHOTO_KINDS);
const listQuerySchema = z.object({ kind: kindSchema.optional() });
const uploadBodySchema = z.object({ kind: kindSchema });
const idParamSchema = z.object({ id: z.string().uuid() });

export class BrandKitPhotoController {
  constructor(private service: BrandKitPhotoService) {}

  private validationError(res: Response, error: unknown): boolean {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: 'Dados inválidos', details: error.errors, timestamp: new Date().toISOString() });
      return true;
    }
    return false;
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { kind } = listQuerySchema.parse(req.query);
      const data = await this.service.list(tenantId, kind);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      if (!this.validationError(res, err)) next(err);
    }
  };

  upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { kind } = uploadBodySchema.parse(req.body);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const data = await this.service.upload(tenantId, kind, files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype })));
      res.status(201).json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      if (!this.validationError(res, err)) next(err);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id } = idParamSchema.parse(req.params);
      await this.service.remove(tenantId, id);
      res.json({ success: true, timestamp: new Date().toISOString() });
    } catch (err) {
      if (!this.validationError(res, err)) next(err);
    }
  };
}
