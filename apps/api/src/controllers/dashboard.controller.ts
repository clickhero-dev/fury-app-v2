import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { getInstagramDashboardInsights, type InstagramDashboardInsights } from '../services/meta/instagram.service.js';

const instagramInsightsQuerySchema = z.object({
  date_from: z.string().min(1, 'date_from obrigatorio'),
  date_to: z.string().min(1, 'date_to obrigatorio'),
});

type GetInstagramInsights = (tenantId: string, dateFrom: string, dateTo: string) => Promise<InstagramDashboardInsights | null>;

/** Controller do Dashboard — glue HTTP fino. Recebe a função de insights via injeção no construtor. */
export class DashboardController {
  constructor(private getInstagramInsights: GetInstagramInsights) {}

  getInstagramInsightsHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const { date_from, date_to } = instagramInsightsQuerySchema.parse(req.query);
      const insights = await this.getInstagramInsights(tenantId, date_from, date_to);

      res.json({ success: true, data: insights, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };
}