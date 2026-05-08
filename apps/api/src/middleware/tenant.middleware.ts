/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const tokenTenantId = req.tenantId;

  if (!tokenTenantId) {
    return next(new AppError(400, 'MISSING_TENANT', 'Tenant ID required'));
  }

  if (!req.user || !req.user.tenantId) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Tenant context not found'));
  }

  req.tenant = { tenantId: req.user.tenantId };
  next();
}
