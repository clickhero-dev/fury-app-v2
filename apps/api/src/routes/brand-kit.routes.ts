import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { AppError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';

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

// Biblioteca do Estúdio: até 20 arquivos por envio
const libraryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') cb(null, true);
    else cb(new Error('Formato inválido. Envie PNG ou JPG.'));
  },
});

// erro do multer vira 400 com mensagem clara (sem isso sai 500 genérico)
const LIBRARY_UPLOAD_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'Cada imagem pode ter no máximo 5MB.',
  LIMIT_FILE_COUNT: 'Envie no máximo 20 imagens por vez.',
  LIMIT_UNEXPECTED_FILE: 'Envie no máximo 20 imagens por vez.',
};
function libraryUploadMiddleware(req: Request, res: Response, next: NextFunction) {
  libraryUpload.array('files[]', 20)(req, res, (err?: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return next(new AppError(400, `UPLOAD_${err.code}`, LIBRARY_UPLOAD_MESSAGES[err.code] ?? 'Não foi possível receber os arquivos.'));
    }
    return next(new AppError(400, 'UPLOAD_INVALID_FILE', (err as Error).message || 'Arquivo inválido.'));
  });
}

router.use(authMiddleware, tenantMiddleware);

router.get('/', controllers.brandKit.get);
router.put('/', controllers.brandKit.upsert);
router.post('/logo', logoUpload.single('file'), controllers.brandKit.uploadLogo);
router.post('/photos', photosUpload.array('files[]'), controllers.brandKit.uploadPhotos);
router.delete('/photos', controllers.brandKit.deletePhoto);
router.get('/library', controllers.brandKitPhotos.list);
router.post('/library', libraryUploadMiddleware, controllers.brandKitPhotos.upload);
router.delete('/library/:id', controllers.brandKitPhotos.remove);

export default router;