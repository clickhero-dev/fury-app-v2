import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { startPlanGeneration, getJobProgress, getPlanById, patchPost } from '../services/planner.service.js';

const updatePostSchema = z.object({
  title: z.string().max(255).optional(),
  caption: z.string().optional(),
  cta: z.string().max(255).optional(),
  hashtags: z.array(z.string()).optional(),
});

export async function generatePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant não encontrado.');

    const job = await startPlanGeneration(tenantId);
    res.status(202).json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
}

export async function getJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId } = req.params;
    const status = await getJobProgress(jobId);
    if (!status) throw new AppError(404, 'NOT_FOUND', 'Job não encontrado.');
    res.json(status);
  } catch (err) {
    next(err);
  }
}

export async function getPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant não encontrado.');

    const plan = await getPlanById(req.params.planId, tenantId);
    if (!plan) throw new AppError(404, 'NOT_FOUND', 'Plano não encontrado.');
    res.json(plan);
  } catch (err) {
    next(err);
  }
}

export async function updatePost(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant não encontrado.');

    const body = updatePostSchema.parse(req.body);
    const updated = await patchPost(req.params.postId, tenantId, body);
    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado.');
    res.json(updated);
  } catch (err) {
    next(err);
  }
}
