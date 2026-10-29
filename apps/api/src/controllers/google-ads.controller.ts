import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { googleAdsCampaignSchema } from '../schemas/google.schemas.js';
import type { GoogleAdsService } from '../services/google/google-ads.service.js';

export class GoogleAdsController {
  constructor(private readonly googleAdsService: Pick<GoogleAdsService, 'createCampaign' | 'listAccessibleCustomers' | 'selectCustomer'>) {}

  listAccessibleCustomers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const data = await this.googleAdsService.listAccessibleCustomers(req.tenant.tenantId);
      res.status(200).json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };

  selectCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const customerId = String(req.body?.customerId ?? '');
      if (!/^\d{6,20}$/.test(customerId)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Conta Google Ads inválida.');
      }
      const data = await this.googleAdsService.selectCustomer(req.tenant.tenantId, customerId);
      res.status(200).json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };

  createCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const input = googleAdsCampaignSchema.parse(req.body);
      const data = await this.googleAdsService.createCampaign(req.tenant.tenantId, input);
      res.status(201).json({ success: true, data, partial_failures: data.partialFailures, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };
}
