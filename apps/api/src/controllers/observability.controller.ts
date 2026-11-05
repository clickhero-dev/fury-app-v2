import type { Request, Response, NextFunction } from 'express';
import { ObservabilityService } from '../services/observability/observability.service.js';

export class ObservabilityController {
  constructor(private service: ObservabilityService) {}

  getKpis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestedKpi = req.query.kpi as string | undefined;
      if (requestedKpi) {
        const data = await this.service.getKpi(requestedKpi);
        if (!data) {
          res.status(404).json({ success: false, error: { code: 'KPI_NOT_FOUND', message: `KPI '${requestedKpi}' not found` } });
          return;
        }
        res.json({ success: true, data });
        return;
      }
      const all = await this.service.getAllKpis();
      res.json({ success: true, data: all });
    } catch (err) {
      next(err);
    }
  };

  listKpis = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: this.service.listKpiMeta() });
    } catch (err) {
      next(err);
    }
  };
}