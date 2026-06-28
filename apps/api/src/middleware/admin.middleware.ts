import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

export function requireSuperadmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'owner' && !req.user?.isSuperadmin) {
    return next(new AppError(403, 'FORBIDDEN', 'Superadmin access required'));
  }

  next();
}
