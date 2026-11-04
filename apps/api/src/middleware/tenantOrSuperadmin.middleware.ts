import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { rbacService } from '../services/core/rbac.service.js';
import { SuperAdminRepository } from '../repository/superadmin.repository.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function tenantOrSuperadminMiddleware(req: Request, _res: Response, next: NextFunction) {
  const user = req.user as any;

  // Superadmin with an explicit target tenant takes priority over their own tenantId
  const rawTarget = req.query.tenantId || req.headers['x-tenant-id'];
  const targetTenantId = typeof rawTarget === 'string' && UUID_RE.test(rawTarget) ? rawTarget : null;
  if (targetTenantId && user?.userId && user.role !== 'mock') {
    try {
      const scope = await rbacService.getAdminScope(user.userId);
      // parceiro só troca para os próprios clientes
      const allowed = scope && (scope.partnerId === null
        || !!(await new SuperAdminRepository().getTenantById(targetTenantId, scope.partnerId)));
      if (allowed) {
        (req.tenant as any) = { tenantId: targetTenantId };
        return next();
      }
    } catch (err) {
      return next(err);
    }
  }

  // Normal tenant-scoped user (or superadmin without an explicit target)
  if (user?.tenantId) {
    (req.tenant as any) = { tenantId: user.tenantId };
    return next();
  }

  return next(new AppError(403, 'FORBIDDEN', 'Tenant context not found'));
}
