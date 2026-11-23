import type { NextFunction, Request, Response } from 'express';
import { db, users } from '@fury/db';
import { and, eq, isNull } from 'drizzle-orm';
import { AppError } from './errorHandler.js';

// membro só usa a integração do titular; cargo vem do banco, não do token
export async function integrationManagerMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user?.userId || req.user.role === 'mock') return next();
    const user = await db.query.users.findFirst({ columns: { role: true }, where: and(eq(users.id, req.user.userId), isNull(users.deletedAt)) });
    if (!user || user.role === 'member') return next(new AppError(403, 'INTEGRATION_OWNER_ONLY', 'Só o titular pode alterar as integrações'));
    next();
  } catch (err) {
    next(err);
  }
}
