import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, brandKits } from '@fury/db';
import { uploadAsset, deleteAsset } from '../services/storage.service.js';

const router = Router();

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/svg+xml') {
      cb(null, true);
    } else {
      cb(new Error('Formato inválido. Envie PNG ou SVG.'));
    }
  },
});

const photosUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Formato inválido. Envie PNG ou JPG.'));
    }
  },
});

const MAX_PHOTOS = 20;

function toResponse(brandKit: typeof brandKits.$inferSelect) {
  return {
    id: brandKit.id,
    tenant_id: brandKit.tenantId,
    logo_url: brandKit.logoUrl,
    primary_color: brandKit.primaryColor,
    secondary_color: brandKit.secondaryColor,
    voice_tone: brandKit.voiceTone,
    photo_urls: (brandKit.photoUrls as string[] | null) ?? [],
    created_at: brandKit.createdAt,
    updated_at: brandKit.updatedAt,
  };
}

// GET /api/brand-kit
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;

    const brandKit = await db.query.brandKits.findFirst({
      where: eq(brandKits.tenantId, tenantId),
    });

    if (!brandKit) {
      return res.status(404).json({
        success: false,
        message: 'Brand Kit não configurado',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true, data: toResponse(brandKit), timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

const upsertBrandKitSchema = z.object({
  primary_color: z.string().regex(HEX_COLOR_REGEX, 'Cor primária inválida. Use o formato #RRGGBB.').optional(),
  secondary_color: z.string().regex(HEX_COLOR_REGEX, 'Cor secundária inválida. Use o formato #RRGGBB.').optional(),
  voice_tone: z.enum(['professional', 'casual', 'urgent', 'premium']).optional(),
  logo_url: z.string().url().nullable().optional(),
  photo_urls: z.array(z.string().url()).optional(),
});

// PUT /api/brand-kit
router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const payload = upsertBrandKitSchema.parse(req.body);

    const values = {
      ...(payload.primary_color !== undefined && { primaryColor: payload.primary_color }),
      ...(payload.secondary_color !== undefined && { secondaryColor: payload.secondary_color }),
      ...(payload.voice_tone !== undefined && { voiceTone: payload.voice_tone }),
      ...(payload.logo_url !== undefined && { logoUrl: payload.logo_url }),
      ...(payload.photo_urls !== undefined && { photoUrls: payload.photo_urls }),
    };

    const [brandKit] = await db
      .insert(brandKits)
      .values({ tenantId, ...values })
      .onConflictDoUpdate({
        target: brandKits.tenantId,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();

    res.json({ success: true, data: toResponse(brandKit), timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// POST /api/brand-kit/logo
router.post('/logo', logoUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo enviado',
        timestamp: new Date().toISOString(),
      });
    }

    const extension = req.file.mimetype === 'image/svg+xml' ? 'svg' : 'png';
    const fileName = `brand-kit/${tenantId}/logo/${randomUUID()}.${extension}`;
    const url = await uploadAsset(req.file.buffer, fileName, req.file.mimetype);

    res.json({ success: true, data: { url }, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// POST /api/brand-kit/photos
router.post('/photos', photosUpload.array('files[]', MAX_PHOTOS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo enviado',
        timestamp: new Date().toISOString(),
      });
    }

    const existing = await db.query.brandKits.findFirst({
      where: eq(brandKits.tenantId, tenantId),
    });
    const existingPhotos = (existing?.photoUrls as string[] | null) ?? [];

    if (existingPhotos.length + files.length > MAX_PHOTOS) {
      return res.status(400).json({
        success: false,
        message: `Limite de ${MAX_PHOTOS} fotos excedido. Você já tem ${existingPhotos.length} foto(s).`,
        timestamp: new Date().toISOString(),
      });
    }

    const extensionByMime: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
    const uploadedUrls: string[] = [];
    for (const file of files) {
      const extension = extensionByMime[file.mimetype] ?? 'jpg';
      const fileName = `brand-kit/${tenantId}/photos/${randomUUID()}.${extension}`;
      const url = await uploadAsset(file.buffer, fileName, file.mimetype);
      uploadedUrls.push(url);
    }

    const photoUrls = [...existingPhotos, ...uploadedUrls];

    await db
      .insert(brandKits)
      .values({ tenantId, photoUrls })
      .onConflictDoUpdate({
        target: brandKits.tenantId,
        set: { photoUrls, updatedAt: new Date() },
      });

    res.json({ success: true, data: { urls: uploadedUrls }, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

const deletePhotoSchema = z.object({
  url: z.string().url(),
});

// DELETE /api/brand-kit/photos
router.delete('/photos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const { url } = deletePhotoSchema.parse(req.body);

    const existing = await db.query.brandKits.findFirst({
      where: eq(brandKits.tenantId, tenantId),
    });
    const existingPhotos = (existing?.photoUrls as string[] | null) ?? [];
    const photoUrls = existingPhotos.filter((u) => u !== url);

    if (photoUrls.length !== existingPhotos.length) {
      await db.update(brandKits).set({ photoUrls, updatedAt: new Date() }).where(eq(brandKits.tenantId, tenantId));
    }

    await deleteAsset(url);

    res.json({ success: true, data: { photo_urls: photoUrls }, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
