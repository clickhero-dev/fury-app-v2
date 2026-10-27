import { type Request, type Response, type NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { SubscriptionRepository } from '../repository/subscription.repository.js';
import { rbacService } from '../services/core/rbac.service.js';

export function checkSubscriptionActive(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  return (async () => {
    try {
      // Exempt from plan checks:
      // - super_admin / admin_partner (platform_role): no plan of their own
      // - Admin: Tenant admin role can manage tenant even if plan is expired
      //   (needed to renew subscription, handle billing, etc)
      // Only 'member' and 'owner' roles are subject to subscription verification
      if (req.user?.role === 'admin') return next();
      if (req.user?.userId && req.user.role !== 'mock') {
        const platformRole = await rbacService.getPlatformRole(req.user.userId);
        if (platformRole === 'super_admin' || platformRole === 'admin_partner') return next();
      }

      const tenantId = req.tenant?.tenantId ?? req.user?.tenantId;
      if (!tenantId) return next(new AppError(401, 'UNAUTHORIZED', 'Tenant não encontrado'));

      const sub = await new SubscriptionRepository(tenantId).findSubscription();

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
