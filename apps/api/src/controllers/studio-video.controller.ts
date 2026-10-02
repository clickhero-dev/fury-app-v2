import type { Request, Response, NextFunction } from 'express';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { BUILTIN_SONG_PATTERN } from '../lib/moneyprinter-client.js';
import { StudioVideoService, VIDEO_TRANSITIONS, VIDEO_VOICES } from '../services/studio/studio-video.service.js';

const createJobSchema = z.object({
  prompt: z.string().trim().min(10).max(1000),
  voice: z.enum(VIDEO_VOICES.map((v) => v.id) as [string, ...string[]]),
  voiceRate: z.number().min(0.8).max(1.2).default(1),
  music: z.object({
    mode: z.enum(['none', 'random', 'preset', 'custom']),
    file: z.string().regex(BUILTIN_SONG_PATTERN).optional(),
    trackId: z.string().uuid().optional(),
    volume: z.number().min(0.05).max(0.6).default(0.2),
  }),
  subtitles: z.object({
    enabled: z.boolean(),
    position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  }),
  transition: z.enum(VIDEO_TRANSITIONS.map((t) => t.id) as [string, ...string[]]),
});

export class StudioVideoController {
  constructor(private service: StudioVideoService) {}

  private tenantId(req: Request): string {
    const tenantId = (req as any).tenant?.tenantId as string | undefined;
    if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    return tenantId;
  }

  getOptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.getOptions(this.tenantId(req)));
    } catch (e) { next(e); }
  };

  uploadMusic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) throw new AppError(400, 'MUSIC_FILE_REQUIRED', 'Envie um arquivo de música.');
      res.status(201).json(await this.service.uploadMusic(this.tenantId(req), file));
    } catch (e) { next(e); }
  };

  /** Prévia pública das músicas embutidas — só nomes outputNNN.mp3 de MPT_SONGS_DIR. */
  builtinPreview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = String(req.params.file ?? '');
      const dir = process.env.MPT_SONGS_DIR;
      if (!dir || !BUILTIN_SONG_PATTERN.test(file) || !existsSync(join(dir, file))) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(join(dir, file));
    } catch (e) { next(e); }
  };

  createJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createJobSchema.parse(req.body);
      res.status(202).json(await this.service.createJob(this.tenantId(req), body as any));
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: e.errors });
        return;
      }
      next(e);
    }
  };

  getJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobId = z.string().uuid().parse(req.params.jobId);
      res.json(await this.service.getJob(this.tenantId(req), jobId));
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(404).json({ error: 'Vídeo não encontrado.' });
        return;
      }
      next(e);
    }
  };

  listActiveJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ jobs: await this.service.listActiveJobs(this.tenantId(req)) });
    } catch (e) { next(e); }
  };
}
