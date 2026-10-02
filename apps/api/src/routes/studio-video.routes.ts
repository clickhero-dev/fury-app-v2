import { Router } from 'express';
import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';

const router = Router();

const AUDIO_MIME = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];

const musicUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (AUDIO_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new AppError(400, 'INVALID_MUSIC_FILE', 'Formato inválido. Envie MP3, WAV ou M4A.'));
  },
});

// Erros do multer (tamanho etc.) viram 400 em vez de 500 genérico
function handleMusicUpload(req: Request, res: Response, next: NextFunction) {
  musicUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 30 MB.' : 'Upload inválido.';
      return next(new AppError(400, 'INVALID_MUSIC_FILE', msg));
    }
    next(err as Error | undefined);
  });
}

// Pública: <audio> não envia Authorization; nomes validados no controller
router.get('/music/builtin/:file', controllers.studioVideo.builtinPreview);

router.get('/options', authMiddleware, tenantMiddleware, controllers.studioVideo.getOptions);
router.post('/music', authMiddleware, tenantMiddleware, handleMusicUpload, controllers.studioVideo.uploadMusic);
router.post('/jobs', authMiddleware, tenantMiddleware, controllers.studioVideo.createJob);
router.get('/jobs', authMiddleware, tenantMiddleware, controllers.studioVideo.listActiveJobs);
router.get('/jobs/:jobId', authMiddleware, tenantMiddleware, controllers.studioVideo.getJob);

export default router;
