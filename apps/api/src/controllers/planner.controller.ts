import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
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
  bulkSchedulePosts,
  bulkDeletePosts,
  createManualPost,
  movePostDay,
  publishDuePosts,
} from '../services/planner.service.js';

export async function generatePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const jobStatus = startPlanGeneration(tenantId);
    res.json({ success: true, data: jobStatus });
  } catch (err) { next(err); }
}

export async function getJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId } = req.params;
    const job = getJobProgress(jobId);
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
    const { year, month } = z.object({
      year: z.coerce.number().int().min(2020).max(2100),
      month: z.coerce.number().int().min(1).max(12),
    }).parse(req.query);
    const posts = await getCalendarPosts(tenantId, year, month);
    res.json({ success: true, data: { posts, year, month } });
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
    const deleted = await bulkDeletePosts(tenantId, postIds);
    res.json({ success: true, data: { count: deleted.length } });
  } catch (err) { next(err); }
}

export async function handleCreatePost(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const body = z.object({
      caption: z.string().max(5000).optional(),
      postType: z.enum(['image', 'carousel', 'reel', 'stories']),
      dayIndex: z.number().int().min(1).max(31),
      platform: z.string().max(50).optional(),
      scheduledAt: z.string().datetime().optional(),
      title: z.string().max(255).optional(),
    }).parse(req.body);
    const post = await createManualPost(tenantId, body);
    res.json({ success: true, data: post });
  } catch (err) { next(err); }
}

export async function handleMovePost(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant!.tenantId;
    const { dayIndex } = z.object({
      dayIndex: z.number().int().min(1).max(31),
    }).parse(req.body);
    const updated = await movePostDay(tenantId, req.params.postId, dayIndex);
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
