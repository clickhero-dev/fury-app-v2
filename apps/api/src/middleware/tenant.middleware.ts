import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { runWithTenant } from '../lib/ai-key-context.js';

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.tenantId) {
    // 403 (Forbidden), not 401 — user IS authenticated but JWT lacks tenantId
    return next(new AppError(403, 'FORBIDDEN', 'Sua conta não está vinculada a um cliente. Fale com o suporte.'));
  }

  req.tenant = { tenantId: req.user.tenantId };
  // chamadas de IA desta requisição usam a chave do dono deste cliente
  runWithTenant(req.user.tenantId, next);
}
