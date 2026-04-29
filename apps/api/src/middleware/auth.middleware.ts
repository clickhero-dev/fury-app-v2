import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from './errorHandler.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid authorization header'));
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}
