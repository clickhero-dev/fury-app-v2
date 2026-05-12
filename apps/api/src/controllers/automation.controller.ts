import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createAutomationRule, getAutomationRules } from '../services/automation.service.js';
import { AppError } from '../middleware/errorHandler.js';

const createRuleSchema = z.object({
  name: z.string().min(3, 'Rule name must be at least 3 characters'),
  description: z.string().optional(),
  trigger: z.string().min(1, 'Trigger is required'),
  threshold: z.number().min(0, 'Threshold cannot be negative'),
  action: z.string().min(1, 'Action is required'),
  enabled: z.boolean().optional().default(true),
});

export async function createRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createRuleSchema.parse(req.body);
    const tenantId = req.tenant?.tenantId || '';

    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const rule = await createAutomationRule({
      tenantId,
      ...data,
    });

    res.status(201).json({
      success: true,
      data: rule,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getRulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant?.tenantId || '';

    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const rules = await getAutomationRules(tenantId);

    res.json({
      success: true,
      data: rules,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
