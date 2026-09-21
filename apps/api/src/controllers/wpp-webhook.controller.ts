import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import type { WppWebhookService } from '../services/wpp/wpp-webhook.service.js';

/**
 * Receptor do webhook uazapi — endpoint PÚBLICO (sem auth por enquanto,
 * decisão registrada na issue #207). Sempre responde 200 rápido; o
 * processamento acontece dentro do service (ingest + auto-confirmação sync
 * de 1 query — BullMQ fica para PR futura).
 */
export class WppWebhookController {
  constructor(private readonly service: WppWebhookService) {}

  handle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as unknown;
      if (typeof body !== 'object' || body === null) {
        throw new AppError(400, 'WPP_WEBHOOK_INVALID_BODY', 'Corpo do webhook deve ser um objeto JSON.');
      }
      await this.service.ingest(body);
      res.json({ received: true });
    } catch (e) {
      next(e);
    }
  };
}
