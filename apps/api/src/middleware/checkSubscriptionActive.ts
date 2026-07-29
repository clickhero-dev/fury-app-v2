import { type Request, type Response, type NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db, subscriptions } from '@fury/db';
import { AppError } from './errorHandler.js';

export function checkSubscriptionActive(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  (async () => {
    try {
      // ponytail: superadmin is exempt from plan checks
      if (req.user?.role === 'superadmin') return next();

      const tenantId = req.tenant?.tenantId ?? req.user?.tenantId;
      if (!tenantId) return next(new AppError(401, 'UNAUTHORIZED', 'Tenant não encontrado'));

      const sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.tenantId, tenantId),
      });

      if (!sub) return next(new AppError(403, 'NO_SUBSCRIPTION', 'Nenhuma assinatura encontrada. Contate o suporte.'));

      // Non-expirable subscriptions skip all date-based checks
      if (sub.isNonExpirable) {
        if (sub.status === 'cancelled' || sub.status === 'inactive') {
          return next(new AppError(403, 'SUBSCRIPTION_EXPIRED', 'Sua assinatura está vencida. Entre em contato com o suporte.'));
        }
        return next();
      }

      const now = new Date();

      if (sub.status === 'cancelled' || sub.status === 'inactive') {
        return next(new AppError(403, 'SUBSCRIPTION_EXPIRED', 'Sua assinatura está vencida. Entre em contato com o suporte.'));
      }

      if (sub.status === 'past_due') {
        return next(new AppError(403, 'SUBSCRIPTION_EXPIRED', 'Sua assinatura está vencida. Entre em contato com o suporte.'));
      }

      if (sub.status === 'trial' && sub.trialEndsAt && now > sub.trialEndsAt) {
        return next(new AppError(403, 'TRIAL_EXPIRED', 'Seu período de teste expirou. Entre em contato com o suporte.'));
      }

      if (sub.status === 'active' && sub.currentPeriodEnd && now > sub.currentPeriodEnd) {
        return next(new AppError(403, 'SUBSCRIPTION_EXPIRED', 'Sua assinatura está vencida. Entre em contato com o suporte.'));
      }

      next();
    } catch (err) {
      next(err);
    }
  })();
}
