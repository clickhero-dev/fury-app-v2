import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import type { DemoDashboardService } from '../services/dashboard/demo-dashboard.service.js';

export class DemoDashboardController {
  constructor(private readonly service: DemoDashboardService) {}

  getDashboardDemo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant?.tenantId;
      if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      const data = await this.service.getForTenant(tenantId);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };
}
