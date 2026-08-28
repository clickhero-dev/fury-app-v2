import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';
import { MAX_PHOTOS } from '../services/brand-kit/brand-kit.service.js';

const router = Router();

// Middlewares HTTP de upload (multer) — a lógica de upload/orquestração vive no BrandKitService.
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/svg+xml') cb(null, true);
    else cb(new Error('Formato inválido. Envie PNG ou SVG.'));
  },
});

const photosUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') cb(null, true);
    else cb(new Error('Formato inválido. Envie PNG ou JPG.'));
  },
});

router.use(authMiddleware, tenantMiddleware);

router.get('/', controllers.brandKit.get);
router.put('/', controllers.brandKit.upsert);
router.post('/logo', logoUpload.single('file'), controllers.brandKit.uploadLogo);
router.post('/photos', photosUpload.array('files[]', MAX_PHOTOS), controllers.brandKit.uploadPhotos);
router.delete('/photos', controllers.brandKit.deletePhoto);

export default router;