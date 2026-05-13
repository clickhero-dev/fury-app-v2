import { Request, Response, NextFunction } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, automationRules, furyInsights } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { createAutomationRule, getAutomationRules } from '../services/automation.service.js';
import { emitToTenant, registerSSEClient, removeSSEClient } from '../lib/sse.js';

const createRuleSchema = z.object({
  name: z.string().min(3, 'Rule name must be at least 3 characters'),
  description: z.string().optional(),
  trigger: z.string().min(1, 'Trigger is required'),
  threshold: z.number().min(0, 'Threshold cannot be negative'),
  isActive: z.boolean().optional().default(true),
  action: z.string().min(1, 'Action is required'),
  enabled: z.boolean().optional().default(true),
});

const deleteRuleSchema = z.object({
  id: z.string().uuid('Invalid rule ID'),
});

export async function createRule(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant not found in request context');
    }

    const payload = createRuleSchema.parse(req.body);

    const created = await createAutomationRule({
      tenantId: req.tenant.tenantId,
      name: payload.name,
      description: payload.description,
      trigger: payload.trigger,
      threshold: payload.threshold,
      action: payload.action,
      enabled: payload.enabled,
    });

    emitToTenant(req.tenant.tenantId, 'rule_created', created);

    return res.status(201).json({
      success: true,
      data: created,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getRules(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant not found in request context');
    }

    const rules = await getAutomationRules(req.tenant.tenantId);

    return res.status(200).json({
      success: true,
      data: rules,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteRule(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant not found in request context');
    }

    const params = deleteRuleSchema.parse(req.params);

    const existing = await db.query.automationRules.findFirst({
      where: and(
        eq(automationRules.id, params.id),
        eq(automationRules.tenantId, req.tenant.tenantId)
      ),
    });

    if (!existing) {
      throw new AppError(403, 'FORBIDDEN', 'Rule not found or does not belong to this tenant');
    }

    await db.delete(automationRules).where(eq(automationRules.id, params.id));

    emitToTenant(req.tenant.tenantId, 'rule_deleted', { id: params.id });

    return res.status(200).json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getTakedowns(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant not found in request context');
    }

    const takedowns = await db.query.furyInsights.findMany({
      where: and(
        eq(furyInsights.tenantId, req.tenant.tenantId),
        eq(furyInsights.suggestionType, 'smart_takedown')
      ),
      orderBy: (table) => [desc(table.createdAt)],
      limit: 20,
    });

    return res.status(200).json({
      success: true,
      data: takedowns,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getSSEFeed(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant not found in request context');
    }

    const tenantId = req.tenant.tenantId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    registerSSEClient(tenantId, res);

    const pingInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, 30000);

    res.on('close', () => {
      clearInterval(pingInterval);
      removeSSEClient(tenantId, res);
    });
  } catch (error) {
    next(error);
  }
}

export async function createRuleHandler(req: Request, res: Response, next: NextFunction) {
  return createRule(req, res, next);
}

export async function getRulesHandler(req: Request, res: Response, next: NextFunction) {
  return getRules(req, res, next);
}
