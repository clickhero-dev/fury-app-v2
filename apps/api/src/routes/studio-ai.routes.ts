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

router.get('/models', controllers.studioAi.getModels);

router.post('/enhance-prompt', authMiddleware, tenantMiddleware, controllers.studioAi.enhancePrompt);
router.post('/generate-image', authMiddleware, tenantMiddleware, controllers.studioAi.generateImage);
router.post('/visual-variation-batches', authMiddleware, tenantMiddleware, controllers.studioAi.createVisualVariationBatch);
router.get('/visual-variation-batches/:batchId', authMiddleware, tenantMiddleware, controllers.studioAi.getVisualVariationBatch);
router.post('/visual-variation-batches/:batchId/cancel', authMiddleware, tenantMiddleware, controllers.studioAi.cancelVisualVariationBatch);
router.post('/visual-variation-batches/:batchId/items/:index/retry', authMiddleware, tenantMiddleware, controllers.studioAi.retryVisualVariationItem);
router.post('/generate-video', authMiddleware, tenantMiddleware, controllers.studioAi.generateVideo);
router.post('/regenerate', authMiddleware, tenantMiddleware, controllers.studioAi.regenerate);
router.post(
  '/regenerate-ad',
  authMiddleware,
  tenantMiddleware,
  maskUpload.single('mask'),
  async (req: Request, res: Response, next: NextFunction) => {
    const maskFile = (req as any).file as Express.Multer.File | undefined;
    try {
      await controllers.studioAi.regenerateAd(req, res, next);
    } finally {
      // ponytail: limpa máscara temporária
      if (maskFile?.path) await unlink(maskFile.path).catch(() => {});
    }
  },
);

export default router;
