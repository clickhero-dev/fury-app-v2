import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { AutomationService } from '../services/automation/automation.service.js';
import { emitToTenant, registerSSEClient, removeSSEClient } from '../lib/sse.js';

const createRuleSchema = z.object({ name: z.string().min(1, 'Name is required').optional(), description: z.string().optional(), trigger: z.string().min(1, 'Trigger is required').optional(), ruleType: z.string().min(1, 'Rule type is required').optional(), isActive: z.boolean().optional().default(true), enabled: z.boolean().optional().default(true), threshold: z.coerce .number({ invalid_type_error: 'Threshold must be a number', }) .min(0, 'Threshold must be greater than or equal to 0'), action: z .enum([ 'pause', 'notify', 'reduce_budget', 'pause_campaign', ]) .optional() .default('pause') .transform((v) => (v === 'pause_campaign' ? 'pause' : v)), });

const deleteRuleSchema = z.object({
  id: z.string().uuid('Invalid rule ID'),
});

const budgetSmartSchema = z.object({
  monthlyBudget: z
    .number()
    .min(300, 'Monthly budget must be at least R$300'),
  adAccountId: z.string().min(1, 'Ad account ID is required'),
});

/** Controller de automação — glue HTTP fino. Recebe o service no construtor (injeção). */
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  createRuleHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(
          401,
          'UNAUTHORIZED',
          'Tenant not found in request context',
        );
      }

      const payload = createRuleSchema.parse(req.body);
      const threshold = payload.threshold;
      const ruleName = payload.name || payload.ruleType || 'Automation Rule';
      const ruleTrigger = payload.trigger || payload.ruleType || 'metric_threshold';

      const { rule, created } = await this.automationService.upsertAutomationRule({
        tenantId: req.tenant.tenantId,
        name: ruleName,
        trigger: ruleTrigger,
        ruleType: payload.ruleType,
        isActive: payload.isActive ?? payload.enabled ?? true,
        threshold,
        action: payload.action,
        description: payload.description,
      });

      emitToTenant(req.tenant.tenantId, created ? 'rule_created' : 'rule_updated', rule);

      return res.status(created ? 201 : 200).json({
        success: true,
        data: rule,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getRulesHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(
          401,
          'UNAUTHORIZED',
          'Tenant not found in request context',
        );
      }

      const rules = await this.automationService.getAutomationRules(req.tenant.tenantId);

      return res.status(200).json({
        success: true,
        data: rules,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  deleteRuleHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(
          401,
          'UNAUTHORIZED',
          'Tenant not found in request context',
        );
      }

      const params = deleteRuleSchema.parse(req.params);

      await this.automationService.deleteAutomationRuleById(req.tenant.tenantId, params.id);

      emitToTenant(req.tenant.tenantId, 'rule_deleted', {
        id: params.id,
      });

      return res.status(200).json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getTakedownsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(
          401,
          'UNAUTHORIZED',
          'Tenant not found in request context',
        );
      }

      const takedowns = await this.automationService.getSmartTakedowns(req.tenant.tenantId);

      return res.status(200).json({
        success: true,
        data: takedowns,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getSSEFeedHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(
          401,
          'UNAUTHORIZED',
          'Tenant not found in request context',
        );
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
  };

  budgetSmartHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(
          401,
          'UNAUTHORIZED',
          'Tenant not found in request context',
        );
      }

      const payload = budgetSmartSchema.parse(req.body);

      const data = this.automationService.getBudgetSmart(payload.monthlyBudget);

      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}