import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.tenantId) {
    // 403 (Forbidden), not 401 — user IS authenticated but JWT lacks tenantId
    return next(new AppError(403, 'FORBIDDEN', 'Tenant context not found'));
  }

  req.tenant = { tenantId: req.user.tenantId };
  next();
}
