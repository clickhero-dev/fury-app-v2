import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { getDelegatedUser } from '../middleware/chat-delegation.middleware.js';
import type { ChatTranscriptionService } from '../services/chat/chat-transcription.service.js';
import type { ChatAttachmentService } from '../services/chat/chat-attachment.service.js';

const conversationParams = z.object({ conversationId: z.string().uuid() });
const attachmentParams = conversationParams.extend({ attachmentId: z.string().uuid() });
const readBody = z.object({ attachmentIds: z.array(z.string().uuid()).min(1).max(3).refine(ids => new Set(ids).size === ids.length), question: z.string().max(20000) }).strict();
function safeError(error: unknown): Error {
  return error instanceof AppError || error instanceof ZodError ? error : new AppError(503, 'CHAT_MEDIA_UNAVAILABLE', 'Mídia do assistente indisponível. Tente novamente.');
}
function requestScope(req: Request, res: Response) {
  const controller = new AbortController(); const cancel = () => controller.abort();
  const close = () => { if (!res.writableFinished) cancel(); };
  req.once('aborted', cancel); res.once('close', close);
  const timer = setTimeout(cancel, 65_000);
  return { signal: controller.signal, done: () => { clearTimeout(timer); req.off('aborted', cancel); res.off('close', close); } };
}
export class ChatMediaController {
  constructor(private readonly transcription: ChatTranscriptionService, private readonly attachments: ChatAttachmentService) {}
  authorizeUpload = async (req: Request, _res: Response, next: NextFunction) => {
    try { const { conversationId } = conversationParams.parse(req.params); await this.attachments.assertOwned(req.user!.tenantId, req.user!.userId, conversationId); next(); }
    catch (error) { next(safeError(error)); }
  };
  transcribe = async (req: Request, res: Response, next: NextFunction) => {
    const scope = requestScope(req, res);
    try {
      if (!req.file) throw new AppError(400, 'CHAT_AUDIO_REQUIRED', 'Selecione um áudio.');
      res.json(await this.transcription.transcribe(req.user!.tenantId, req.file, scope.signal));
    } catch (error) { next(safeError(error)); } finally { scope.done(); }
  };
  upload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = conversationParams.parse(req.params);
      res.status(201).json(await this.attachments.upload(req.user!.tenantId, req.user!.userId, conversationId, Array.isArray(req.files) ? req.files : []));
    } catch (error) { next(safeError(error)); }
  };
  download = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId, attachmentId } = attachmentParams.parse(req.params);
      const { bytes, attachment } = await this.attachments.download(req.user!.tenantId, req.user!.userId, conversationId, attachmentId);
      res.set({ 'Content-Type': attachment.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}` });
      res.send(bytes);
    } catch (error) { next(safeError(error)); }
  };
  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId, attachmentId } = attachmentParams.parse(req.params);
      await this.attachments.remove(req.user!.tenantId, req.user!.userId, conversationId, attachmentId); res.status(204).end();
    } catch (error) { next(safeError(error)); }
  };
  read = async (req: Request, res: Response, next: NextFunction) => {
    const scope = requestScope(req, res);
    try {
      const { conversationId } = conversationParams.parse(req.params); const { attachmentIds, question } = readBody.parse(req.body);
      res.json(await this.attachments.read(req.user!.tenantId, req.user!.userId, conversationId, attachmentIds, question, scope.signal));
    } catch (error) { next(safeError(error)); } finally { scope.done(); }
  };
  cleanup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = conversationParams.parse(req.params);
      const delegated = getDelegatedUser(req);
      if (delegated) await this.attachments.cleanupDelegated(delegated.tenantId, delegated.userId, conversationId);
      else await this.attachments.cleanup(req.user!.tenantId, req.user!.userId, conversationId);
      res.status(204).end();
    } catch (error) { next(safeError(error)); }
  };
}
