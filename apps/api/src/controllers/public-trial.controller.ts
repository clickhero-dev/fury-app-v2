import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import type { PublicTrialService } from '../services/core/public-trial.service.js';
import { normalizePublicTrialSignup } from '../services/core/public-trial-signup.js';

const accessSchema = z.object({ token: z.string().length(64).regex(/^[a-f0-9]+$/i) }).strict();

export class PublicTrialController {
  constructor(private readonly service: PublicTrialService) {}

  signup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.set('Cache-Control', 'no-store');
      if (process.env.TRIAL_WEBHOOK_SECRET) {
        const raw = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body);
        const { verifyWebhookSignature } = await import('../services/core/public-trial-signup.js');
        if (!verifyWebhookSignature(raw, req.header('x-trial-signature'), process.env.TRIAL_WEBHOOK_SECRET)) {
          throw new AppError(401, 'INVALID_SIGNATURE', 'Requisição não autorizada.');
        }
      }
      const payload = normalizePublicTrialSignup(req.body);
      const result = await this.service.signup(payload);
      if (!result.created) {
        // Contrato explícito do integrador. Não inclua nome, tenant ou qualquer
        // outro dado que permita enumerar/inspecionar a conta existente.
        return res.status(409).json({ erro: 'EMAIL_JA_CADASTRADO' });
      }
      res.status(201).json({
        created: true,
        redirect_url: result.redirectUrl,
        message: 'Cadastro criado com sucesso.',
      });
    } catch (error) { next(error); }
  };

  access = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.set('Cache-Control', 'no-store');
      const { token } = accessSchema.parse(req.body);
      const result = await this.service.access(token);
      res.set('Cache-Control', 'no-store').json({ success: true, data: result });
    } catch (error) { next(error); }
  };
}
