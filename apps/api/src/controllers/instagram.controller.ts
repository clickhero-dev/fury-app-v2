import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { getRankedInstagramPosts } from '../services/instagram.service.js';

const postsRankedQuerySchema = z.object({
  objective: z.enum(['visits', 'engagement', 'messages']),
});

export async function getPostsRankedHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const { objective } = postsRankedQuerySchema.parse(req.query);
    const posts = await getRankedInstagramPosts(tenantId, objective);

    res.json({
      success: true,
      data: posts,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
