import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

export function superadminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'superadmin') {
    return next(new AppError(403, 'FORBIDDEN', 'Apenas superadmins podem acessar esta rota'));
  }
  next();
}
