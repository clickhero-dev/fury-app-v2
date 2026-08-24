import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { AppError } from '../middleware/errorHandler.js';
import { uploadAsset } from '../services/storage.service.js';
import {
  startPlanGeneration,
  getJobProgress,
  getPlanById,
  getLatestPlanByTenant,
  getPrerequisites,
  confirmPlan,
  revalidatePlan,
  editPostWithAI,
  updatePostFields,
  getCalendarPosts,
  getCalendarPostsByDateRange,
  bulkSchedulePosts,
  bulkDeletePosts,
  createManualPost,
  movePostDay,
  movePostDate,
  publishDuePosts,
  getAgentLabels,
} from '../services/planner.service.js';

export async function generatePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const jobStatus = await startPlanGeneration(tenantId);
    res.json({ success: true, data: jobStatus });
  } catch (err) { next(err); }
}

export async function getJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId } = req.params;
    const job = await getJobProgress(jobId);
    if (!job || job.tenantId !== req.tenant!.tenantId) {
      throw new AppError(404, 'NOT_FOUND', 'Job não encontrado');
    }
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
}

export async function getPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const plan = await getPlanById(req.params.planId, tenantId);
    if (!plan) throw new AppError(404, 'NOT_FOUND', 'Plano não encontrado');
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
}

export async function getLatestPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const plan = await getLatestPlanByTenant(tenantId);
    res.json({ success: true, data: plan ?? null });
  } catch (err) { next(err); }
}

export async function handleGetPrerequisites(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const checks = await getPrerequisites(tenantId);
    res.json({ success: true, data: checks });
  } catch (err) { next(err); }
}

export async function handleConfirm(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const { planId } = z.object({ planId: z.string().uuid() }).parse(req.body);
    const plan = await confirmPlan(planId, tenantId);
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
}

export async function handleRevalidate(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const { planId, ...updates } = req.body;
    const plan = await revalidatePlan(planId, tenantId, updates);
    res.json({ success: true, data: plan });
  } catch (err) { next(err); }
}

const editPostSchema = z.union([
  z.object({ prompt: z.string().min(1).max(500) }),
  z.object({
    caption: z.string().optional(),
    cta: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    imageUrl: z.string().url().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
  }),
]);

export async function handleEditPost(req: Request, res: Response, next: NextFunction) {
  try {
    const body = editPostSchema.parse(req.body);
    const tenantId = req.tenant!.tenantId;
    const postId = req.params.postId;
    const updated = 'prompt' in body
      ? await editPostWithAI(postId, tenantId, body.prompt)
      : await updatePostFields(postId, tenantId, body);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

// ===== Calendário Editorial =====

export async function handleGetCalendar(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;

    // Fase 6: Novo formato ISO dates (startDate/endDate)
    // Nenhum outro consumidor usa o formato antigo (year/month)
    const querySchema = z.object({
      startDate: z.string().date(), // ISO date: "2026-08-01"
      endDate: z.string().date(),   // ISO date: "2026-09-01"
    });

    const query = querySchema.parse(req.query);
    const posts = await getCalendarPostsByDateRange(tenantId, query.startDate, query.endDate);

    res.json({ success: true, data: { posts, startDate: query.startDate, endDate: query.endDate } });
  } catch (err) { next(err); }
}

export async function handleBulkSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const { postIds, scheduledAt } = z.object({
      postIds: z.array(z.string().uuid()).min(1).max(100),
      scheduledAt: z.string().datetime().nullable(),
    }).parse(req.body);
    const updated = await bulkSchedulePosts(tenantId, postIds, scheduledAt);
    res.json({ success: true, data: { count: updated.length } });
  } catch (err) { next(err); }
}

export async function handleBulkDelete(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const { postIds } = z.object({
      postIds: z.array(z.string().uuid()).min(1).max(100),
    }).parse(req.body);
    console.log(`[handleBulkDelete] tenant ${tenantId}: ${postIds.length} postIds`, postIds);
    const deleted = await bulkDeletePosts(tenantId, postIds);
    res.json({ success: true, data: { count: deleted.length } });
  } catch (err) {
    console.error('[handleBulkDelete] ERROR:', err);
    if (err instanceof Error) {
      console.error('[handleBulkDelete] message:', err.message);
      console.error('[handleBulkDelete] stack:', err.stack?.split('\n').slice(0, 3).join('\n'));
    }
    next(err);
  }
}

export async function handleCreatePost(req: Request, res: Response, next: NextFunction) {
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
    }).and(
      z.union([
        z.object({ date: z.string().date() }), // Novo: ISO date "2026-08-19"
        z.object({ dayIndex: z.number().int().min(1).max(31) }), // Antigo: dia do mês
      ])
    );

    const body = bodySchema.parse(req.body);
    const post = await createManualPost(tenantId, body as any);
    res.json({ success: true, data: post });
  } catch (err) { next(err); }
}

export async function handleMovePost(req: Request, res: Response, next: NextFunction) {
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
      updated = await movePostDate(tenantId, postId, body.date, body.scheduledAt);
    } else {
      updated = await movePostDay(tenantId, postId, body.dayIndex);
    }

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function handlePublishDue(req: Request, res: Response, next: NextFunction) {
  try {
    // Cron (sem auth): publica de todos os tenants
    if (!req.tenant) {
      const { db, tenants } = await import('@fury/db');
      const allTenants = await db.query.tenants.findMany();
      let total = 0;
      for (const t of allTenants) {
        const result = await publishDuePosts(t.id);
        total += result.published;
      }
      res.json({ success: true, data: { published: total } });
      return;
    }
    // User (com auth): publica só do tenant logado
    const result = await publishDuePosts(req.tenant.tenantId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function handleUploadMedia(req: Request, res: Response, next: NextFunction) {
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
}

export async function handleGetAgentLabels(req: Request, res: Response, next: NextFunction) {
  try {
    const labels = getAgentLabels();
    res.json({ success: true, data: labels });
  } catch (err) { next(err); }
}
