import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { GoalService } from '../services/goals/goal.service.js';

const goalBodySchema = z.object({
  objective: z.string().min(1),
  niche: z.string().min(1),
  mainProduct: z.string().min(1),
  monthlyBudget: z.number().positive(),
  targetCpa: z.number().positive(),
});

/** Controller de metas — glue HTTP fino. Recebe o service no construtor (injeção). */
export class GoalController {
  constructor(private service: GoalService) {}

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const data = await this.service.getGoal(tenantId);
      res.status(200).json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };

  setup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const body = goalBodySchema.parse(req.body);
      const data = await this.service.upsertGoal(tenantId, body);
      res.status(200).json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const body = goalBodySchema.parse(req.body);
      const data = await this.service.updateGoal(tenantId, body);
      res.status(200).json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };

  getProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.tenant!;
      const data = await this.service.getProgress(tenantId, {
        start: typeof req.query.startDate === 'string' ? req.query.startDate : null,
        end: typeof req.query.endDate === 'string' ? req.query.endDate : null,
      });
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };
}