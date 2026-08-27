import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { FuryEngineRepository } from '../repository/fury-engine.repository.js';
import { authMiddleware, authSSEMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { registerSSEClient, emitToTenant } from '../lib/sse.js';

const router = Router();

router.get('/live-feed', authSSEMiddleware, tenantMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;

    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    registerSSEClient(tenantId, res);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, 30000);

    res.on('close', () => {
      clearInterval(heartbeat);
    });
  } catch (error) {
    next(error);
  }
});

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
    const config = await new FuryEngineRepository(tenantId).findOrCreateFuryConfig();
    res.json({ success: true, data: config, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

router.patch('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const payload = updateConfigSchema.parse(req.body);

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (payload.targetRoas !== undefined) updates.targetRoas = payload.targetRoas.toString();
    if (payload.targetCpa !== undefined) updates.targetCpa = payload.targetCpa.toString();
    if (payload.targetCtr !== undefined) updates.targetCtr = payload.targetCtr.toString();
    if (payload.targetBudgetUtilization !== undefined) updates.targetBudgetUtilization = payload.targetBudgetUtilization.toString();

    const result = await new FuryEngineRepository(tenantId).upsertFuryConfig(updates);

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
    const rules = await new FuryEngineRepository(tenantId).listPerformanceRules();
    res.json({ success: true, data: rules, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

router.post('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const payload = createRuleSchema.parse(req.body);

    const created = await new FuryEngineRepository(tenantId).createPerformanceRule({
      name: payload.name,
      conditionField: payload.conditionField,
      conditionOperator: payload.conditionOperator,
      conditionValue: payload.conditionValue.toString(),
      action: payload.action,
      actionValue: payload.actionValue?.toString(),
      isActive: payload.isActive,
    });

    emitToTenant(tenantId, 'rule_created', created);

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

    const repo = new FuryEngineRepository(tenantId);
    const existing = await repo.findPerformanceRuleById(id);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Rule not found');

    const updates: Record<string, any> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.conditionField !== undefined) updates.conditionField = payload.conditionField;
    if (payload.conditionOperator !== undefined) updates.conditionOperator = payload.conditionOperator;
    if (payload.conditionValue !== undefined) updates.conditionValue = payload.conditionValue.toString();
    if (payload.action !== undefined) updates.action = payload.action;
    if (payload.actionValue !== undefined) updates.actionValue = payload.actionValue.toString();
    if (payload.isActive !== undefined) updates.isActive = payload.isActive;

    const updated = await repo.updatePerformanceRule(id, updates);

    emitToTenant(tenantId, 'rule_updated', updated);

    res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

router.delete('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const { id } = req.params;

    const repo = new FuryEngineRepository(tenantId);
    const existing = await repo.findPerformanceRuleById(id);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Rule not found');

    await repo.deletePerformanceRule(id);

    emitToTenant(tenantId, 'rule_deleted', { id });

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

    const scores = await new FuryEngineRepository(tenantId).listPerformanceScores(campaignId ? String(campaignId) : undefined);

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

    const repo = new FuryEngineRepository(tenantId);
    const tenantRules = await repo.listPerformanceRules();
    const tenantRuleIds = tenantRules.map((r) => r.id);

    if (tenantRuleIds.length === 0) {
      return res.json({ success: true, data: [], timestamp: new Date().toISOString() });
    }

    const executions = await repo.listRuleExecutions(tenantRuleIds, ruleId ? String(ruleId) : undefined, campaignId ? String(campaignId) : undefined);

    return res.json({ success: true, data: executions, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

export default router;
