import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { AnnouncementRepository } from '../repository/announcement.repository.js';
import { formatAnnouncementText } from '../services/llms/announcement-formatter.js';

const writeSchema = z.object({
  title: z.string().trim().min(3).max(255),
  markdown: z.string().min(1).max(100_000),
  isActive: z.boolean().default(false),
  showToNewUsers: z.boolean().default(false),
  endsAt: z.coerce.date().nullable().default(null),
});
const updateSchema = writeSchema.partial().refine((v) => Object.keys(v).length > 0);
const idSchema = z.string().uuid();
// 'Manter ativo' e data de encerramento são exclusivos
const assertSingleMode = (v: { showToNewUsers?: boolean; endsAt?: Date | null }) => {
  if (v.showToNewUsers && v.endsAt) throw new AppError(400, 'ANNOUNCEMENT_MODE_CONFLICT', 'Escolha “Manter ativo” ou uma data de encerramento, não os dois');
};
const formatSchema = z.object({ text: z.string().trim().min(1).max(5000) });

export class AnnouncementController {
  constructor(private repo: AnnouncementRepository, private format = formatAnnouncementText) {}

  listAdmin = async (_req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await this.repo.listAdmin() }); } catch (e) { next(e); } };
  create = async (req: Request, res: Response, next: NextFunction) => { try {
    const body = writeSchema.parse(req.body); assertSingleMode(body);
    const row = await this.repo.create({ ...body, publishedAt: body.isActive ? new Date() : null });
    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); } };
  update = async (req: Request, res: Response, next: NextFunction) => { try {
    const existing = await this.repo.findById(idSchema.parse(req.params.id));
    if (!existing) throw new AppError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Aviso não encontrado');
    const body = updateSchema.parse(req.body); assertSingleMode({ ...existing, ...body });
    // published_at nasce na 1ª ativação e não muda ao religar
    const publishedAt = existing.publishedAt ?? ((body.isActive ?? existing.isActive) ? new Date() : null);
    res.json({ success: true, data: await this.repo.update(existing.id, { ...body, publishedAt }) });
  } catch (e) { next(e); } };
  delete = async (req: Request, res: Response, next: NextFunction) => { try {
    const id = idSchema.parse(req.params.id);
    if (!await this.repo.findById(id)) throw new AppError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Aviso não encontrado');
    await this.repo.delete(id); res.json({ success: true, data: null });
  } catch (e) { next(e); } };
  formatText = async (req: Request, res: Response, next: NextFunction) => { try {
    const { text } = formatSchema.parse(req.body);
    res.json({ success: true, data: { markdown: await this.format(text) } });
  } catch (e) { next(e); } };

  listPending = async (req: Request, res: Response, next: NextFunction) => { try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Não autenticado');
    res.json({ success: true, data: await this.repo.listPending(req.user.userId) });
  } catch (e) { next(e); } };
  markSeen = async (req: Request, res: Response, next: NextFunction) => { try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Não autenticado');
    const id = idSchema.parse(req.params.id);
    if (!await this.repo.findById(id)) throw new AppError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Aviso não encontrado');
    await this.repo.markSeen(req.user.userId, id); res.json({ success: true, data: null });
  } catch (e) { next(e); } };
}
