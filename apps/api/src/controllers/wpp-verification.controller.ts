import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import type { WppVerificationService } from '../services/wpp/wpp-verification.service.js';

const startSchema = z.object({
  // Dígitos nacionais (10-11) ou já com DDI 55 (12-13). O service normaliza.
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{10,13}$/, 'Informe um número válido com DDD.')),
});

const confirmSchema = z.object({
  verificationId: z.string().uuid(),
  code: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().length(6, 'Código deve ter 6 dígitos.')),
});

function requireTenant(req: Request): string {
  const tenantId = (req as Request & { tenant?: { tenantId?: string } }).tenant?.tenantId;
  if (!tenantId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária.');
  }
  return tenantId;
}

/** Verificação de número WhatsApp do tenant (start/confirm/status). */
export class WppVerificationController {
  constructor(private readonly service: WppVerificationService) {}

  start = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = requireTenant(req);
      const { phone } = startSchema.parse(req.body);
      const data = await this.service.start(tenantId, phone);
      res.status(201).json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) {
      next(e);
    }
  };

  confirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = requireTenant(req);
      const { verificationId, code } = confirmSchema.parse(req.body);
      const data = await this.service.confirm(tenantId, verificationId, code);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) {
      next(e);
    }
  };

  status = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = requireTenant(req);
      const data = await this.service.status(tenantId);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) {
      next(e);
    }
  };
}
