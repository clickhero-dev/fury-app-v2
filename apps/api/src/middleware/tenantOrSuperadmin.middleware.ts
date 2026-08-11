import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

export function tenantOrSuperadminMiddleware(req: Request, _res: Response, next: NextFunction) {
  const user = req.user as any;

  // Superadmin with an explicit target tenant takes priority over their own tenantId
  if (user?.role === 'superadmin') {
    const tenantId = (req.query.tenantId as string) || (req.headers['x-tenant-id'] as string);
    if (tenantId) {
      (req.tenant as any) = { tenantId };
      return next();
    }
  }

  // Normal tenant-scoped user (or superadmin without an explicit target)
  if (user?.tenantId) {
    (req.tenant as any) = { tenantId: user.tenantId };
    return next();
  }

  return next(new AppError(403, 'FORBIDDEN', 'Tenant context not found'));
}
