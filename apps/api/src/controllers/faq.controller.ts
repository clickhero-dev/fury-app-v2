import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { uploadAsset } from '../services/storage/storage.service.js';
import { FaqRepository } from '../repository/faq.repository.js';

const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const writeSchema = z.object({ title: z.string().trim().min(3).max(255), slug: z.string().trim().min(2).max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(), markdown: z.string().min(1).max(100_000), status: z.enum(['draft', 'published']).default('draft') });
const updateSchema = writeSchema.partial().refine((v) => Object.keys(v).length > 0);
const pageSchema = z.object({ q: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });

export class FaqController {
  constructor(private repo: FaqRepository) {}
  listAdmin = async (_req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await this.repo.listAdmin() }); } catch (e) { next(e); } };
  create = async (req: Request, res: Response, next: NextFunction) => { try {
    const body = writeSchema.parse(req.body); const slug = body.slug ?? slugify(body.title);
    if (!slug) throw new AppError(400, 'INVALID_FAQ_SLUG', 'Título não gera um slug válido');
    if (await this.repo.findBySlug(slug)) throw new AppError(409, 'FAQ_SLUG_EXISTS', 'Já existe uma FAQ com este slug');
    const row = await this.repo.create({ ...body, slug, publishedAt: body.status === 'published' ? new Date() : null });
    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); } };
  update = async (req: Request, res: Response, next: NextFunction) => { try {
    const existing = await this.repo.findById(req.params.id); if (!existing) throw new AppError(404, 'FAQ_NOT_FOUND', 'FAQ não encontrada');
    // O slug nasce do título, mas depois só muda quando o autor o edita
    // explicitamente; isso evita trocar URLs compartilhadas ao corrigir um título.
    const body = updateSchema.parse(req.body); const slug = body.slug;
    if (slug && slug !== existing.slug) { const conflict = await this.repo.findBySlug(slug); if (conflict) throw new AppError(409, 'FAQ_SLUG_EXISTS', 'Já existe uma FAQ com este slug'); }
    const status = body.status ?? existing.status;
    const row = await this.repo.update(existing.id, { ...body, ...(slug ? { slug } : {}), publishedAt: status === 'published' ? (existing.publishedAt ?? new Date()) : null });
    if (slug && slug !== existing.slug) await this.repo.addSlugRedirect(existing.slug, existing.id);
    res.json({ success: true, data: row });
  } catch (e) { next(e); } };
  delete = async (req: Request, res: Response, next: NextFunction) => { try { if (!await this.repo.findById(req.params.id)) throw new AppError(404, 'FAQ_NOT_FOUND', 'FAQ não encontrada'); await this.repo.delete(req.params.id); res.json({ success: true, data: null }); } catch (e) { next(e); } };
  listPublic = async (req: Request, res: Response, next: NextFunction) => { try { const { q, page, limit } = pageSchema.parse(req.query); res.json({ success: true, data: await this.repo.searchPublished(q, limit, (page - 1) * limit), meta: { page, limit } }); } catch (e) { next(e); } };
  getPublicBySlug = async (req: Request, res: Response, next: NextFunction) => { try { const faq = await this.repo.findPublishedBySlug(req.params.slug); if (faq) return res.json({ success: true, data: faq }); const redirect = await this.repo.findRedirect(req.params.slug); if (redirect?.faq && redirect.faq.status === 'published') return res.json({ success: true, data: { ...redirect.faq, canonicalSlug: redirect.faq.slug } }); throw new AppError(404, 'FAQ_NOT_FOUND', 'FAQ não encontrada'); } catch (e) { next(e); } };
  uploadImage = async (req: Request, res: Response, next: NextFunction) => { try { if (!req.file) throw new AppError(400, 'FAQ_IMAGE_REQUIRED', 'Envie uma imagem'); const ext = req.file.mimetype === 'image/jpeg' ? 'jpg' : req.file.mimetype.split('/')[1]; const url = await uploadAsset(req.file.buffer, `faqs/${randomUUID()}.${ext}`, req.file.mimetype); res.status(201).json({ success: true, data: { url } }); } catch (e) { next(e); } };
}
