import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StudioRatingService } from '../services/studio/studio-rating.service.js';

const schema = z.object({ rating: z.number().int().min(1).max(5) }).strict();

export class StudioRatingController {
  constructor(private readonly service: StudioRatingService) {}

  rate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = schema.parse(req.body);
      const tenantId = (req as any).tenant?.tenantId as string | undefined;
      const userId = (req as any).user?.userId as string | undefined;
      if (!tenantId || !userId) { res.status(403).json({ error: 'Forbidden' }); return; }
      const assetId = z.string().uuid().parse(req.params.assetId);
      res.status(200).json(await this.service.rate({ tenantId, userId, assetId, rating: body.rating }));
    } catch (error) {
      if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation error', details: error.errors }); return; }
      next(error);
    }
  };
}
