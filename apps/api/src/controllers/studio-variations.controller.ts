import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { StudioVariationsService } from '../services/studio/studio-variations.service.js';

const batchSchema = z.object({ batchId: z.string().uuid(), assetId: z.string().uuid() });

export class StudioVariationsController {
  constructor(private readonly service: StudioVariationsService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = batchSchema.parse(req.body);
      const tenantId = req.tenant?.tenantId as string;
      const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || `https://${req.get('host')}`;
      const result = await this.service.createBatch(tenantId, body, publicBaseUrl);
      res.status(202).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else next(error);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const batchId = z.string().uuid().parse(req.params.batchId);
      const tenantId = req.tenant?.tenantId as string;
      res.json(await this.service.getBatch(tenantId, batchId));
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const batchId = z.string().uuid().parse(req.params.batchId);
      const tenantId = req.tenant?.tenantId as string;
      res.json(await this.service.cancelBatch(tenantId, batchId));
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else next(error);
    }
  };
}
