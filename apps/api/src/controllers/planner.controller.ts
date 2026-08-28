import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { AppError } from '../middleware/errorHandler.js';
import { uploadAsset } from '../services/storage/storage.service.js';
import { openrouterService } from '../services/llms/openrouter.service.js';
import { plannerService } from '../services/planner/planner.service.js';
import type { PlannerService } from '../services/planner/planner.service.js';

/** Controller de planner/campanha — glue HTTP fino. Recebe o service no construtor (injeção). */
export class PlannerController {
  constructor(private plannerService: PlannerService) {}

  generatePlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // checa se tem créditos disponíveis antes de iniciar o workflow (evita gastar LLM se não tiver créditos)
      await openrouterService.assertCreditsAvailable();

      const tenantId = req.tenant!.tenantId;
      const jobStatus = await this.plannerService.startPlanGeneration(tenantId);
      res.json({ success: true, data: jobStatus });
    } catch (err) { next(err); }
  };

  getJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const job = await this.plannerService.getJobProgress(jobId);
      if (!job || job.tenantId !== req.tenant!.tenantId) {
        throw new AppError(404, 'NOT_FOUND', 'Job não encontrado');
      }
      res.json({ success: true, data: job });
    } catch (err) { next(err); }
  };

  getPlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const plan = await this.plannerService.getPlanById(req.params.planId, tenantId);
      if (!plan) throw new AppError(404, 'NOT_FOUND', 'Plano não encontrado');
      res.json({ success: true, data: plan });
    } catch (err) { next(err); }
  };

  getLatestPlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const plan = await this.plannerService.getLatestPlanByTenant(tenantId);
      res.json({ success: true, data: plan ?? null });
    } catch (err) { next(err); }
  };

  handleGetPrerequisites = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const checks = await this.plannerService.getPrerequisites(tenantId);
      res.json({ success: true, data: checks });
    } catch (err) { next(err); }
  };

  handleConfirm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const { planId } = z.object({ planId: z.string().uuid() }).parse(req.body);
      const plan = await this.plannerService.confirmPlan(planId, tenantId);
      res.json({ success: true, data: plan });
    } catch (err) { next(err); }
  };

  handleRevalidate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const { planId, ...updates } = req.body;
      const plan = await this.plannerService.revalidatePlan(planId, tenantId, updates);
      res.json({ success: true, data: plan });
    } catch (err) { next(err); }
  };

  // ===== Edição de Post =====

  handleEditPost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = editPostSchema.parse(req.body);
      const tenantId = req.tenant!.tenantId;
      const postId = req.params.postId;
      const updated = 'prompt' in body
        ? await this.plannerService.editPostWithAI(postId, tenantId, body.prompt)
        : await this.plannerService.updatePostFields(postId, tenantId, body);
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  };

  // ===== Calendário Editorial =====

  handleGetCalendar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.tenantId;

      // Fase 6: Novo formato ISO dates (startDate/endDate)
      // Nenhum outro consumidor usa o formato antigo (year/month)
      const querySchema = z.object({
        startDate: z.string().date(), // ISO date: "2026-08-01"
        endDate: z.string().date(),   // ISO date: "2026-09-01"
      });

      const query = querySchema.parse(req.query);
      const posts = await this.plannerService.getCalendarPostsByDateRange(tenantId, query.startDate, query.endDate);

      res.json({ success: true, data: { posts, startDate: query.startDate, endDate: query.endDate } });
    } catch (err) { next(err); }
  };

  handleBulkSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const { postIds, scheduledAt } = z.object({
        postIds: z.array(z.string().uuid()).min(1).max(100),
        scheduledAt: z.string().datetime().nullable(),
      }).parse(req.body);
      const updated = await this.plannerService.bulkSchedulePosts(tenantId, postIds, scheduledAt);
      res.json({ success: true, data: { count: updated.length } });
    } catch (err) { next(err); }
  };

  handleBulkDelete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const { postIds } = z.object({
        postIds: z.array(z.string().uuid()).min(1).max(100),
      }).parse(req.body);
      console.log(`[handleBulkDelete] tenant ${tenantId}: ${postIds.length} postIds`, postIds);
      const deleted = await this.plannerService.bulkDeletePosts(tenantId, postIds);
      res.json({ success: true, data: { count: deleted.length } });
    } catch (err) {
      console.error('[handleBulkDelete] ERROR:', err);
      if (err instanceof Error) {
        console.error('[handleBulkDelete] message:', err.message);
        console.error('[handleBulkDelete] stack:', err.stack?.split('\n').slice(0, 3).join('\n'));
      }
      next(err);
    }
  };

  handleCreatePost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.tenantId;

      // Dual-format: aceita (date) novo OU (dayIndex) antigo
      const bodySchema = z.object({
        caption: z.string().max(5000).optional(),
        postType: z.enum(['image', 'carousel', 'reel', 'stories']),
        platform: z.string().max(50).optional(),
        scheduledAt: z.string().datetime().optional(),
        title: z.string().max(255).optional(),
        imageUrl: z.string().url().optional(),
        imageUrls: z.array(z.string().url()).max(5).optional(),
      }).and(
        z.union([
          z.object({ date: z.string().date() }), // Novo: ISO date "2026-08-19"
          z.object({ dayIndex: z.number().int().min(1).max(31) }), // Antigo: dia do mês
        ])
      );

      const body = bodySchema.parse(req.body);
      const post = await this.plannerService.createManualPost(tenantId, body as any);
      res.json({ success: true, data: post });
    } catch (err) { next(err); }
  };

  handleMovePost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const postId = req.params.postId;

      const bodySchema = z.union([
        z.object({
          date: z.string().date(),
          scheduledAt: z.string().datetime().optional(), // Suporte opcional a horário no move
        }),
        z.object({ dayIndex: z.number().int().min(1).max(31) }),
      ]);

      const body = bodySchema.parse(req.body);

      let updated;
      if ('date' in body) {
        updated = await this.plannerService.movePostDate(tenantId, postId, body.date, body.scheduledAt);
      } else {
        updated = await this.plannerService.movePostDay(tenantId, postId, body.dayIndex);
      }

      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  };

  handlePublishDue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Cron (sem auth): publica de todos os tenants
      if (!req.tenant) {
        const { db, tenants } = await import('@fury/db');
        const allTenants = await db.query.tenants.findMany();
        let total = 0;
        for (const t of allTenants) {
          const result = await this.plannerService.publishDuePosts(t.id);
          total += result.published;
        }
        res.json({ success: true, data: { published: total } });
        return;
      }
      // User (com auth): publica só do tenant logado
      const result = await this.plannerService.publishDuePosts(req.tenant.tenantId);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  };

  handleUploadMedia = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });
      }
      const ext = req.file.mimetype === 'image/png' ? 'png'
        : req.file.mimetype === 'image/jpeg' ? 'jpg'
        : req.file.mimetype === 'video/mp4' ? 'mp4'
        : req.file.mimetype === 'video/quicktime' ? 'mov'
        : 'png';
      const fileName = `posts/${tenantId}/${randomUUID()}.${ext}`;
      const url = await uploadAsset(req.file.buffer, fileName, req.file.mimetype);
      res.json({ success: true, data: { url } });
    } catch (err) { next(err); }
  };

  handleGetAgentLabels = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const labels = this.plannerService.getAgentLabels();
      res.json({ success: true, data: labels });
    } catch (err) { next(err); }
  };
}

const editPostSchema = z.union([
  z.object({ prompt: z.string().min(1).max(500) }),
  z.object({
    caption: z.string().optional(),
    cta: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    imageUrl: z.string().url().optional(),
    imageUrls: z.array(z.string().url()).max(5).optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
  }),
]);

/**
 * Singleton do controller usado como aliases de módulo (backward-compat).
 * Rotas novos usam o composition root (di.ts). Aliases preservam chamadores
 * existentes (ex.: __tests__/planner-controller.test.ts).
 */
const plannerController = new PlannerController(plannerService);

export const generatePlan = plannerController.generatePlan;
export const getJob = plannerController.getJob;
export const getPlan = plannerController.getPlan;
export const getLatestPlan = plannerController.getLatestPlan;
export const handleGetPrerequisites = plannerController.handleGetPrerequisites;
export const handleConfirm = plannerController.handleConfirm;
export const handleRevalidate = plannerController.handleRevalidate;
export const handleEditPost = plannerController.handleEditPost;
export const handleGetCalendar = plannerController.handleGetCalendar;
export const handleBulkSchedule = plannerController.handleBulkSchedule;
export const handleBulkDelete = plannerController.handleBulkDelete;
export const handleCreatePost = plannerController.handleCreatePost;
export const handleMovePost = plannerController.handleMovePost;
export const handlePublishDue = plannerController.handlePublishDue;
export const handleUploadMedia = plannerController.handleUploadMedia;
export const handleGetAgentLabels = plannerController.handleGetAgentLabels;