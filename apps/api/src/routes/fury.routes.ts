import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db, performanceRules, performanceScores, ruleExecutions, furyConfig } from '@fury/db';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

// ==================== Config ====================

const updateConfigSchema = z.object({
  targetRoas: z.number().positive().optional(),
  targetCpa: z.number().positive().optional(),
  targetCtr: z.number().positive().optional(),
  targetBudgetUtilization: z.number().min(10).max(100).optional(),
});

router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    let config = await db.query.furyConfig.findFirst({
      where: eq(furyConfig.tenantId, tenantId),
    });
    if (!config) {
      [config] = await db.insert(furyConfig).values({ tenantId }).returning();
    }
    res.json({ success: true, data: config, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

router.patch('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const payload = updateConfigSchema.parse(req.body);

    const updates: Partial<typeof furyConfig.$inferInsert> = { updatedAt: new Date() };
    if (payload.targetRoas !== undefined) updates.targetRoas = payload.targetRoas.toString();
    if (payload.targetCpa !== undefined) updates.targetCpa = payload.targetCpa.toString();
    if (payload.targetCtr !== undefined) updates.targetCtr = payload.targetCtr.toString();
    if (payload.targetBudgetUtilization !== undefined) updates.targetBudgetUtilization = payload.targetBudgetUtilization.toString();

    const existing = await db.query.furyConfig.findFirst({
      where: eq(furyConfig.tenantId, tenantId),
    });

    let result;
    if (existing) {
      [result] = await db.update(furyConfig).set(updates).where(eq(furyConfig.tenantId, tenantId)).returning();
    } else {
      [result] = await db.insert(furyConfig).values({ tenantId, ...updates }).returning();
    }

    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// ==================== Validation schemas ====================

const createRuleSchema = z.object({
  name: z.string().min(1),
  conditionField: z.enum(['cpc', 'ctr', 'roas', 'cpa', 'spend']),
  conditionOperator: z.enum(['gt', 'lt', 'eq']),
  conditionValue: z.number().positive(),
  action: z.enum(['pause_campaign', 'reduce_budget', 'notify', 'increase_budget']),
  actionValue: z.number().optional(),
  isActive: z.boolean().optional().default(true),
});

const updateRuleSchema = createRuleSchema.partial();

// ==================== Rules ====================

router.get('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const rules = await db.query.performanceRules.findMany({
      where: eq(performanceRules.tenantId, tenantId),
      orderBy: [desc(performanceRules.createdAt)],
    });
    res.json({ success: true, data: rules, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

router.post('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const payload = createRuleSchema.parse(req.body);

    const [created] = await db.insert(performanceRules).values({
      tenantId,
      name: payload.name,
      conditionField: payload.conditionField,
      conditionOperator: payload.conditionOperator,
      conditionValue: payload.conditionValue.toString(),
      action: payload.action,
      actionValue: payload.actionValue?.toString(),
      isActive: payload.isActive,
    }).returning();

    res.status(201).json({ success: true, data: created, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

router.patch('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const { id } = req.params;
    const payload = updateRuleSchema.parse(req.body);

    const existing = await db.query.performanceRules.findFirst({
      where: and(eq(performanceRules.id, id), eq(performanceRules.tenantId, tenantId)),
    });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Rule not found');

    const updates: Partial<typeof performanceRules.$inferInsert> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.conditionField !== undefined) updates.conditionField = payload.conditionField;
    if (payload.conditionOperator !== undefined) updates.conditionOperator = payload.conditionOperator;
    if (payload.conditionValue !== undefined) updates.conditionValue = payload.conditionValue.toString();
    if (payload.action !== undefined) updates.action = payload.action;
    if (payload.actionValue !== undefined) updates.actionValue = payload.actionValue.toString();
    if (payload.isActive !== undefined) updates.isActive = payload.isActive;

    const [updated] = await db.update(performanceRules).set(updates).where(eq(performanceRules.id, id)).returning();
    res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

router.delete('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const { id } = req.params;

    const existing = await db.query.performanceRules.findFirst({
      where: and(eq(performanceRules.id, id), eq(performanceRules.tenantId, tenantId)),
    });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Rule not found');

    await db.delete(performanceRules).where(eq(performanceRules.id, id));
    res.json({ success: true, data: null, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// ==================== Scores ====================

router.get('/scores', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const { campaignId } = req.query;

    const scores = await db.query.performanceScores.findMany({
      where: campaignId
        ? and(eq(performanceScores.tenantId, tenantId), eq(performanceScores.campaignId, String(campaignId)))
        : eq(performanceScores.tenantId, tenantId),
      orderBy: [desc(performanceScores.computedAt)],
      limit: 100,
    });

    res.json({ success: true, data: scores, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// ==================== History ====================

router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const { campaignId, ruleId } = req.query;

    const tenantRules = await db.query.performanceRules.findMany({
      where: eq(performanceRules.tenantId, tenantId),
    });
    const tenantRuleIds = tenantRules.map((r: typeof tenantRules[number]) => r.id);

    if (tenantRuleIds.length === 0) {
      return res.json({ success: true, data: [], timestamp: new Date().toISOString() });
    }

    const filters = [];
    if (ruleId && tenantRuleIds.includes(String(ruleId))) {
      filters.push(eq(ruleExecutions.ruleId, String(ruleId)));
    } else {
      // Only return executions belonging to this tenant's rules
      // drizzle doesn't have inArray without sql helper in this pattern, filter in-memory after fetch
    }
    if (campaignId) filters.push(eq(ruleExecutions.campaignId, String(campaignId)));

    const executions = await db.query.ruleExecutions.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
      orderBy: [desc(ruleExecutions.triggeredAt)],
      limit: 100,
    });

    const filtered = executions.filter((e: typeof executions[number]) => tenantRuleIds.includes(e.ruleId));

    return res.json({ success: true, data: filtered, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

export default router;
