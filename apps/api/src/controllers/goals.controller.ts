import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, clientGoals } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { furyAnalyze } from '../services/fury-engine.service.js';

const goalSchema = z.object({
  objective: z.enum(['aumentar_vendas', 'gerar_leads', 'aumentar_trafego', 'reconhecimento_marca']),
  monthlyBudget: z.number().min(300, 'O orçamento mensal mínimo é R$300'),
  targetCpa: z.number().positive('O CPA alvo deve ser positivo'),
  niche: z.string().min(1),
  currentMonthlyRevenue: z.number().positive().optional(),
  mainProduct: z.string().min(1),
});

export async function setupGoal(req: Request, res: Response, next: NextFunction) {
  try {
    const data = goalSchema.parse(req.body);
    const { tenantId } = req;

    const existing = await db.query.clientGoals.findFirst({
      where: eq(clientGoals.tenantId, tenantId),
    });

    let goal;
    if (existing) {
      [goal] = await db
        .update(clientGoals)
        .set({
          objective: data.objective,
          monthlyBudget: { value: data.monthlyBudget, mainProduct: data.mainProduct, currentMonthlyRevenue: data.currentMonthlyRevenue },
          targetCpa: { value: data.targetCpa },
          niche: data.niche,
          updatedAt: new Date(),
        })
        .where(eq(clientGoals.tenantId, tenantId))
        .returning();
    } else {
      [goal] = await db
        .insert(clientGoals)
        .values({
          tenantId,
          objective: data.objective,
          monthlyBudget: { value: data.monthlyBudget, mainProduct: data.mainProduct, currentMonthlyRevenue: data.currentMonthlyRevenue },
          targetCpa: { value: data.targetCpa },
          niche: data.niche,
        })
        .returning();
    }

    const initialInsights = await furyAnalyze(tenantId);

    res.status(existing ? 200 : 201).json({
      success: true,
      data: { goal, initialInsights },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getGoal(req: Request, res: Response, next: NextFunction) {
  try {
    const goal = await db.query.clientGoals.findFirst({
      where: eq(clientGoals.tenantId, req.tenantId),
    });

    if (!goal) {
      throw new AppError(404, 'GOAL_NOT_FOUND', 'No goals configured for this tenant');
    }

    res.json({
      success: true,
      data: goal,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateGoal(req: Request, res: Response, next: NextFunction) {
  try {
    const data = goalSchema.parse(req.body);
    const { tenantId } = req;

    const existing = await db.query.clientGoals.findFirst({
      where: eq(clientGoals.tenantId, tenantId),
    });

    if (!existing) {
      throw new AppError(404, 'GOAL_NOT_FOUND', 'No goals configured for this tenant. Use POST /api/goals/setup first.');
    }

    const [goal] = await db
      .update(clientGoals)
      .set({
        objective: data.objective,
        monthlyBudget: { value: data.monthlyBudget, mainProduct: data.mainProduct, currentMonthlyRevenue: data.currentMonthlyRevenue },
        targetCpa: { value: data.targetCpa },
        niche: data.niche,
        updatedAt: new Date(),
      })
      .where(eq(clientGoals.tenantId, tenantId))
      .returning();

    res.json({
      success: true,
      data: goal,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
