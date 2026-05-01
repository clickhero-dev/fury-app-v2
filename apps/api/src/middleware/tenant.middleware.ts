import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.headers['x-tenant-id'] as string | undefined;

  if (!tenantId) {
    return next(new AppError(400, 'MISSING_TENANT', 'X-Tenant-Id header is required'));
  }

  req.tenantId = tenantId;
  next();
}
