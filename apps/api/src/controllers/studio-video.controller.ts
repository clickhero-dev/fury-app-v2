import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { StudioVideoService, VIDEO_ASPECT_RATIOS, VIDEO_DURATIONS } from '../services/studio/studio-video.service.js';

const aspectRatio = z.enum(VIDEO_ASPECT_RATIOS);
const duration = z.number().int().refine((d) => (VIDEO_DURATIONS as readonly number[]).includes(d), 'Duração inválida');
const photoIds = z.array(z.string().uuid()).max(4).default([]);

const scriptSchema = z.object({
  prompt: z.string().trim().min(10).max(1000),
  photoIds,
  aspectRatio,
  duration,
});

const sceneSchema = z.object({
  start: z.number().min(0).max(60),
  end: z.number().min(0).max(60),
  visual: z.string().trim().min(3).max(600),
  narration: z.string().trim().max(400).default(''),
});

const createJobSchema = scriptSchema.extend({
  scenes: z.array(sceneSchema).min(1).max(8),
});

const adjustSchema = z.object({ feedback: z.string().trim().min(3).max(500) });

export class StudioVideoController {
  constructor(private service: StudioVideoService) {}

  private tenantId(req: Request): string {
    const tenantId = (req as any).tenant?.tenantId as string | undefined;
    if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    return tenantId;
  }

  private handle(fn: (req: Request) => Promise<unknown>, status = 200) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.status(status).json(await fn(req));
      } catch (e) {
        // mesmo formato do errorHandler, com mensagem legível no front
        if (e instanceof z.ZodError) {
          const issue = e.errors[0];
          next(new AppError(400, 'VALIDATION_ERROR', `Dados inválidos (${issue?.path.join('.') || 'corpo'}): ${issue?.message ?? ''}`.trim()));
          return;
        }
        next(e);
      }
    };
  }

  getOptions = this.handle(async (req) => this.service.getOptions(this.tenantId(req)));

  generateScript = this.handle(async (req) => {
    const body = scriptSchema.parse(req.body);
    return this.service.generateScript(this.tenantId(req), body);
  });

  createJob = this.handle(async (req) => {
    const body = createJobSchema.parse(req.body);
    return this.service.createJob(this.tenantId(req), body);
  }, 202);

  adjust = this.handle(async (req) => {
    const assetId = z.string().uuid().parse(req.params.assetId);
    const { feedback } = adjustSchema.parse(req.body);
    return this.service.adjustVideo(this.tenantId(req), assetId, feedback);
  }, 202);

  getJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = z.string().uuid().safeParse(req.params.jobId);
      if (!jobId.success) {
        res.status(404).json({ error: 'Vídeo não encontrado.' });
        return;
      }
      res.json(await this.service.getJob(this.tenantId(req), jobId.data));
    } catch (e) { next(e); }
  };

  listActiveJobs = this.handle(async (req) => ({ jobs: await this.service.listActiveJobs(this.tenantId(req)) }));
}
