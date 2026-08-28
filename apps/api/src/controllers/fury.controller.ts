import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { FuryEngineService } from '../services/fury/fury-engine.service.js';
import { emitToTenant } from '../lib/sse.js';

const updateConfigSchema = z.object({
  targetRoas: z.number().positive().optional(),
  targetCpa: z.number().positive().optional(),
  targetCtr: z.number().positive().optional(),
  targetBudgetUtilization: z.number().min(10).max(100).optional(),
});

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

export class FuryController {
  constructor(private service: FuryEngineService) {}

  getConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      res.json({ success: true, data: await this.service.getConfig(tenantId), timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  patchConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const payload = updateConfigSchema.parse(req.body);
      res.json({ success: true, data: await this.service.updateConfig(tenantId, payload), timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  listRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      res.json({ success: true, data: await this.service.listRules(tenantId), timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  createRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const payload = createRuleSchema.parse(req.body);
      const created = await this.service.createRule(tenantId, payload);
      emitToTenant(tenantId, 'rule_created', created);
      res.status(201).json({ success: true, data: created, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  updateRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id } = req.params;
      const payload = updateRuleSchema.parse(req.body);
      const updated = await this.service.updateRule(tenantId, id, payload);
      emitToTenant(tenantId, 'rule_updated', updated);
      res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  deleteRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id } = req.params;
      await this.service.deleteRule(tenantId, id);
      emitToTenant(tenantId, 'rule_deleted', { id });
      res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  listScores = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { campaignId } = req.query;
      res.json({ success: true, data: await this.service.listScores(tenantId, campaignId ? String(campaignId) : undefined), timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  listHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { campaignId, ruleId } = req.query;
      res.json({ success: true, data: await this.service.listHistory(tenantId, { ruleId: ruleId ? String(ruleId) : undefined, campaignId: campaignId ? String(campaignId) : undefined }), timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };
}