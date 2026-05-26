import { Request, Response, NextFunction } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, automationRules, furyInsights } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { getAutomationRules } from '../services/automation.service.js';
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

export async function createRuleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
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

    const existing = await db.query.automationRules.findFirst({
      where: and(
        eq(automationRules.tenantId, req.tenant.tenantId),
        eq(automationRules.name, ruleName),
      ),
    });

    if (existing) {
      const updated = await db
        .update(automationRules)
        .set({
          name: ruleName,
          trigger: ruleTrigger,
          isActive: payload.isActive,
          enabled: payload.enabled ? 'true' : 'false',
          threshold: threshold.toString(),
          action: payload.action,
          description: payload.description,
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
        name: ruleName,
        trigger: ruleTrigger,
        ruleType: payload.ruleType || ruleTrigger,
        isActive: payload.isActive,
        enabled: payload.enabled ? 'true' : 'false',
        threshold: threshold.toString(),
        action: payload.action,
        description: payload.description,
      })
      .returning();

    emitToTenant(req.tenant.tenantId, 'rule_created', created[0]);

    return res.status(201).json({
      success: true,
      data: created[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getRulesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Tenant not found in request context',
      );
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

export async function deleteRuleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Tenant not found in request context',
      );
    }

    const params = deleteRuleSchema.parse(req.params);

    const existing = await db.query.automationRules.findFirst({
      where: and(
        eq(automationRules.id, params.id),
        eq(automationRules.tenantId, req.tenant.tenantId),
      ),
    });

    if (!existing) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Rule not found or does not belong to this tenant',
      );
    }

    await db.delete(automationRules).where(eq(automationRules.id, params.id));

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
}

export async function getTakedownsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Tenant not found in request context',
      );
    }

    const takedowns = await db.query.furyInsights.findMany({
      where: and(
        eq(furyInsights.tenantId, req.tenant.tenantId),
        eq(furyInsights.suggestionType, 'smart_takedown'),
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

export async function getSSEFeedHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
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
}

export async function budgetSmartHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Tenant not found in request context',
      );
    }

    const payload = budgetSmartSchema.parse(req.body);

    const monthlyBudget = payload.monthlyBudget;

    const campaigns = [
      {
        id: '1',
        name: 'Campanha Leads',
        budget: 500,
        metrics: { roas: 4.5 },
      },
      {
        id: '2',
        name: 'Campanha Conversão',
        budget: 300,
        metrics: { roas: 2.8 },
      },
    ];

    if (!campaigns.length) {
      return res.status(200).json({
        success: true,
        data: {
          monthlyBudget,
          distribution: [],
          previsao: {
            leadsEstimados: Math.round(monthlyBudget / 50),
            vendasEstimadas: Math.round(monthlyBudget / 150),
            roasEsperado: 3.2,
            resumo: `Com R$${monthlyBudget}/mês, estimamos ${Math.round(
              monthlyBudget / 50,
            )} leads a um CPA médio de R$50.`,
          },
        },
      });
    }

    const sortedCampaigns = campaigns.sort(
      (a, b) => b.metrics.roas - a.metrics.roas,
    );

    const totalRoas = sortedCampaigns.reduce(
      (acc, campaign) => acc + campaign.metrics.roas,
      0,
    );

    const distribution = sortedCampaigns.map((campaign) => {
      const percentage = campaign.metrics.roas / totalRoas;

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        currentBudget: campaign.budget,
        suggestedBudget: Math.round(monthlyBudget * percentage),
        roas: campaign.metrics.roas,
      };
    });

    const response = {
      monthlyBudget,
      distribution,
      previsao: {
        leadsEstimados: Math.round(monthlyBudget / 45),
        vendasEstimadas: Math.round(monthlyBudget / 160),
        roasEsperado: 3.8,
        resumo: `Com R$${monthlyBudget}/mês, a distribuição inteligente prioriza campanhas com maior ROAS, aumentando potencial de conversão e retorno.`,
      },
      diasRestantes: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0,
      ).getDate() - new Date().getDate(),
    };

    res.status(200).json({
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
