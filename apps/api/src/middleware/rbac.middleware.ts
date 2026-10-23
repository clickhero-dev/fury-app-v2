import { type Request, type Response, type NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { peekUsersFromRequest } from './auth.middleware.js';
import { RBAC_SERVICES } from '../lib/rbac-services.js';
import { rbacService, type RbacService } from '../services/core/rbac.service.js';

// Minúsculo, sem barras repetidas/finais; . e .. ficam literais (o Express não os resolve)
function normalizePath(path: string): string {
  const segments = path.toLowerCase().replace(/\\/g, '/').split('/').filter(Boolean);
  return '/' + segments.join('/');
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/');
}

// Keys de todos os prefixos que casam (hierárquico), no caminho cru e no decodificado
export function resolveServiceKeys(rawPath: string): string[] | null {
  const candidates = [normalizePath(rawPath)];
  try {
    candidates.push(normalizePath(decodeURIComponent(rawPath)));
  } catch {
    return null;
  }
  const keys = new Set<string>();
  for (const path of candidates) {
    for (const entry of RBAC_SERVICES) {
      if (matchesPrefix(path, entry.prefix)) keys.add(entry.key);
    }
  }
  return [...keys];
}

export function createRbacMiddleware(service: Pick<RbacService, 'checkServices'> = rbacService) {
  return async function rbacMiddleware(req: Request, _res: Response, next: NextFunction) {
    const keys = resolveServiceKeys(req.path);
    if (keys === null) return next(new AppError(400, 'INVALID_PATH', 'Caminho inválido'));
    if (keys.length === 0) return next();

    const users = peekUsersFromRequest(req).filter((u) => u.role !== 'mock');
    try {
      for (const user of users) {
        const result = await service.checkServices(user.userId, keys);
        if (result === 'unknown_user') return next(new AppError(401, 'UNAUTHORIZED', 'Usuário não encontrado'));
        if (result === 'blocked') {
          return next(new AppError(403, 'SERVICE_BLOCKED', 'Recurso não disponível para sua conta'));
        }
      }
    } catch (err) {
      // na dúvida, bloqueia
      console.error('[rbac] falha ao verificar permissões:', err);
      return next(new AppError(503, 'RBAC_UNAVAILABLE', 'Não foi possível verificar permissões'));
    }
    next();
  };
}

export const rbacMiddleware = createRbacMiddleware();
