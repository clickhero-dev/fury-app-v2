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

const editPostSchema = z.object({
  prompt: z.string().min(1).max(500),
});

export async function handleEditPost(req: Request, res: Response, next: NextFunction) {
  try {
    const { prompt } = editPostSchema.parse(req.body);
    const tenantId = req.tenant!.tenantId;
    const postId = req.params.postId;
    const updated = await editPostWithAI(postId, tenantId, prompt);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}
