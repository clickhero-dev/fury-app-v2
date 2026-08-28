import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { unlink } from 'node:fs/promises';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';

const router = Router();

// multer HTTP: máscara em disco (heap zero) para regenerate-ad. Lógica vive no serviço.
const maskUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpdir()),
    filename: (_req, file, cb) => cb(null, `mask-${randomUUID()}.${file.mimetype.includes('png') ? 'png' : 'jpg'}`),
  }),
  limits: { fileSize: 1 * 1024 * 1024 },
});

router.get('/models', controllers.openrouter.getModels);

router.post('/enhance-prompt', authMiddleware, tenantMiddleware, controllers.openrouter.enhancePrompt);
router.post('/generate-image', authMiddleware, tenantMiddleware, controllers.openrouter.generateImage);
router.post('/generate-video', authMiddleware, tenantMiddleware, controllers.openrouter.generateVideo);
router.post('/regenerate', authMiddleware, tenantMiddleware, controllers.openrouter.regenerate);
router.post(
  '/regenerate-ad',
  authMiddleware,
  tenantMiddleware,
  maskUpload.single('mask'),
  async (req: Request, res: Response, next: NextFunction) => {
    const maskFile = (req as any).file as Express.Multer.File | undefined;
    try {
      await controllers.openrouter.regenerateAd(req, res, next);
    } finally {
      // ponytail: limpa máscara temporária
      if (maskFile?.path) await unlink(maskFile.path).catch(() => {});
    }
  },
);

export default router;