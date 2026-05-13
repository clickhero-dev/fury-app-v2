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
import { and, eq, desc } from 'drizzle-orm';
import { db, automationRules, furyInsights } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { emitToTenant, registerSSEClient, removeSSEClient } from '../lib/sse.js';

const createRuleSchema = z.object({
  ruleType: z.string().min(1, 'Rule type is required'),
  isActive: z.boolean().optional().default(true),
  threshold: z.string().or(z.number()).refine((v) => !isNaN(parseFloat(String(v))), 'Invalid threshold'),
  action: z.enum(['pause', 'notify', 'reduce_budget']).optional().default('pause'),
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
    const threshold = parseFloat(String(payload.threshold));

    const existing = await db.query.automationRules.findFirst({
      where: and(
        eq(automationRules.tenantId, req.tenant.tenantId),
        eq(automationRules.ruleType, payload.ruleType)
      ),
    });

    if (existing) {
      const updated = await db
        .update(automationRules)
        .set({
          isActive: payload.isActive,
          threshold: threshold.toString(),
          action: payload.action,
        })
        .where(eq(automationRules.id, existing.id))
        .returning();

      emitToTenant(req.tenant.tenantId, 'rule_updated', updated[0]);

      return res.status(200).json({
        success: true,
        data: updated[0],
        timestamp: new Date().toISOString(),
      });
    }

    const created = await db
      .insert(automationRules)
      .values({
        tenantId: req.tenant.tenantId,
        ruleType: payload.ruleType,
        isActive: payload.isActive,
        threshold: threshold.toString(),
        action: payload.action,
      })
      .returning();

    emitToTenant(req.tenant.tenantId, 'rule_created', created[0]);

    res.status(201).json({
      success: true,
      data: created[0],
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

    const rules = await db.query.automationRules.findMany({
      where: eq(automationRules.tenantId, req.tenant.tenantId),
      orderBy: (table) => [desc(table.createdAt)],
    });

    res.status(200).json({
      success: true,
      data: rules,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
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

    res.status(200).json({
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

    res.status(200).json({
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
