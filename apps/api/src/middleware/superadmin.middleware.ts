import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { rbacService } from '../services/core/rbac.service.js';

// Papel vem do platform_role no banco (sem novo login); quem trocar o papel chama rbacService.bumpVersion
export async function superadminMiddleware(req: Request, _res: Response, next: NextFunction) {
  const forbidden = new AppError(403, 'FORBIDDEN', 'Apenas superadmins podem acessar esta rota');
  if (!req.user || req.user.role === 'mock') return next(forbidden);
  try {
    const platformRole = await rbacService.getPlatformRole(req.user.userId);
    if (platformRole !== 'super_admin') return next(forbidden);
  } catch (err) {
    console.error('[superadmin] falha ao verificar papel:', err);
    return next(new AppError(503, 'RBAC_UNAVAILABLE', 'Não foi possível verificar permissões'));
  }
  next();
}
