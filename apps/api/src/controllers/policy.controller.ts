import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PolicyService } from '../services/policy/policy.service.js';

const acceptSchema = z.object({
  versionId: z.string().uuid('versionId deve ser um UUID válido'),
});

/**
 * Controller do domínio **Política de uso** — glue HTTP fino (ADR-0001).
 * Zero acesso a dados; parse/format/tratamento de erro apenas.
 */
export class PolicyController {
  constructor(private readonly policyService: PolicyService) {}

  /** GET /policy/current — estado completo (conteúdo + aceite) para o usuário logado. */
  getCurrent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new Error('User not found in request');
      const state = await this.policyService.getCurrentForUser(req.user.userId);

      res.status(200).json({
        success: true,
        data: state,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  /** POST /policy/accept — registra o aceite do usuário na versão vigente. */
  accept = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new Error('User not found in request');

      const parsed = acceptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Body inválido: informe versionId (UUID da versão vigente).',
          },
          timestamp: new Date().toISOString(),
        });
      }

      const state = await this.policyService.accept(
        req.user.tenantId,
        req.user.userId,
        parsed.data.versionId
      );

      res.status(200).json({
        success: true,
        data: state,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}
