import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.tenantId) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Tenant context not found'));
  }

  req.tenant = { tenantId: req.user.tenantId };
  next();
}
