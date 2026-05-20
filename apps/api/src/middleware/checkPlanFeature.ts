import { type Request, type Response, type NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db, subscriptions, plans } from '@fury/db';
import { AppError } from './errorHandler.js';

export type PlanFeature =
  | 'studio'
  | 'fury_engine'
  | 'smart_takedown'
  | 'analytics_advanced'
  | 'multi_accounts'
  | 'sla';

type FeaturesMap = Partial<Record<PlanFeature, boolean>>;

export function checkPlanFeature(feature: PlanFeature) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant?.tenantId ?? req.user?.tenantId;
      if (!tenantId) return next(new AppError(401, 'UNAUTHORIZED', 'Tenant not found'));

      const sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.tenantId, tenantId),
      });

      if (!sub || sub.status === 'cancelled' || sub.status === 'inactive') {
        return next(new AppError(403, 'NO_ACTIVE_SUBSCRIPTION', 'Assinatura ativa necessária'));
      }

      const plan = await db.query.plans.findFirst({
        where: eq(plans.id, sub.planId),
      });

      if (!plan) return next(new AppError(403, 'PLAN_NOT_FOUND', 'Plano não encontrado'));

      const features = (plan.features ?? {}) as FeaturesMap;
      if (!features[feature]) {
        return next(
          new AppError(
            403,
            'FEATURE_NOT_INCLUDED',
            `Recurso "${feature}" não incluído no plano ${plan.name}. Faça upgrade para acessar.`
          )
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
