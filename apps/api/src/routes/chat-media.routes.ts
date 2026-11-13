import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../middleware/errorHandler.js';
import { MiB } from '../services/chat/chat-media-validator.js';
import type { ChatMediaController } from '../controllers/chat-media.controller.js';

/** Multer's usual 3×50MiB memory storage exceeds the aggregate budget for chunked requests. */
function boundedStorage(maxBytes: number): multer.StorageEngine {
  const used = new WeakMap<Request, number>();
  return {
    _handleFile(req, file, callback) {
      const chunks: Buffer[] = []; let size = 0; let failed = false;
      file.stream.on('data', (chunk: Buffer) => {
        const aggregate = (used.get(req) ?? 0) + chunk.length; used.set(req, aggregate);
        if (aggregate > maxBytes) {
          if (!failed) { failed = true; chunks.length = 0; callback(new AppError(413, 'CHAT_MEDIA_LIMIT', 'Os arquivos excedem o limite permitido.')); }
          return;
        }
        if (!failed) { chunks.push(chunk); size += chunk.length; }
      });
      file.stream.once('error', () => { if (!failed) { failed = true; chunks.length = 0; callback(new AppError(400, 'CHAT_MULTIPART_INVALID', 'Envio inválido.')); } });
      file.stream.once('end', () => { if (!failed) callback(null, { buffer: Buffer.concat(chunks), size }); });
    },
    _removeFile(_req, file, callback) { delete (file as Partial<Express.Multer.File>).buffer; callback(null); },
  };
}
function multipart(audio: boolean): RequestHandler {
  const upload = multer({ storage: boundedStorage((audio ? 10 : 60) * MiB), limits: { files: audio ? 1 : 3, fileSize: (audio ? 10 : 50) * MiB, fields: 0, parts: audio ? 2 : 4, fieldNameSize: 40 } });
  const parse = audio ? upload.single('audio') : upload.array('files', 3);
  return (req, res, next) => {
    if (!req.is('multipart/form-data')) return next(new AppError(400, 'CHAT_MULTIPART_REQUIRED', 'Envie o arquivo como multipart.'));
    const timer = setTimeout(() => { if (!res.headersSent) res.status(408).json({ error: { code: 'CHAT_UPLOAD_TIMEOUT', message: 'O envio demorou demais.' } }); req.destroy(); }, 30_000);
    parse(req, res, error => {
      clearTimeout(timer);
      if (!error) return next();
      const limit = error instanceof multer.MulterError && ['LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_PART_COUNT'].includes(error.code);
      next(error instanceof AppError ? error : new AppError(limit ? 413 : 400, 'CHAT_MULTIPART_INVALID', limit ? 'Os arquivos excedem os limites permitidos.' : 'Envio de arquivo inválido.'));
    });
  };
}

export interface ChatMediaRouteOptions { maxRequestsPerMinute?: number; maxConcurrent?: number }
export function createChatMediaRouter(controller: ChatMediaController, options: ChatMediaRouteOptions = {}): Router {
  const router = Router(); const limits = new Map<string, { count: number; until: number }>(); let active = 0;
  const budget: RequestHandler = (req, res, next) => {
    const now = Date.now(); const key = `${req.user!.tenantId}:${req.user!.userId}`;
    for (const [identity, entry] of limits) if (entry.until <= now) limits.delete(identity);
    const entry = limits.get(key) ?? { count: 0, until: now + 60_000 };
    if (entry.count >= (options.maxRequestsPerMinute ?? 20) || active >= (options.maxConcurrent ?? 4) || limits.size >= 10000) {
      res.setHeader('Retry-After', '60'); return next(new AppError(429, 'CHAT_MEDIA_RATE_LIMIT', 'Aguarde antes de enviar outra mídia.'));
    }
    entry.count++; limits.set(key, entry); active++;
    let released = false; const release = () => { if (!released) { released = true; active--; } };
    res.once('finish', release); res.once('close', release); next();
  };
  router.post('/transcriptions', budget, multipart(true), controller.transcribe);
  router.post('/conversations/:conversationId/attachments', controller.authorizeUpload, budget, multipart(false), controller.upload);
  router.post('/conversations/:conversationId/attachments/read', budget, controller.read);
  router.get('/conversations/:conversationId/attachments/:attachmentId', controller.download);
  router.delete('/conversations/:conversationId/attachments/:attachmentId', controller.remove);
  router.delete('/conversations/:conversationId/attachments', controller.cleanup);
  return router;
}
