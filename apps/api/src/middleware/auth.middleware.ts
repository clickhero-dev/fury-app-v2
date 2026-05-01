import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

// TODO: Replace with real JWT validation when auth service is implemented.
// For now, accepts X-User-Id + X-Tenant-Id headers (development/testing only).
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'] as string | undefined;

  if (!userId) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
  }

  req.userId = userId;
  next();
}
