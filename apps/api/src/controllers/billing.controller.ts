import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BillingService } from '../services/billing/billing.service.js';

const subscribeSchema = z.object({
  planId: z.string().uuid(),
  billingType: z.enum(['BOLETO', 'PIX', 'CREDIT_CARD']).default('PIX'),
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  customerCpfCnpj: z.string().min(11, 'CPF ou CNPJ é obrigatório').transform((v) => v.replace(/\D/g, '')),
});

export class BillingController {
  constructor(private service: BillingService) {}

  listPlans = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.listActivePlans();
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  webhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.headers['asaas-access-token'] as string | undefined;
      if (!token || token !== process.env.ASAAS_WEBHOOK_TOKEN) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const event = req.body as { event: string; payment?: { id: string; status: string; subscription?: string } };
      await this.service.handleWebhook(event);
      res.json({ received: true });
    } catch (e) { next(e); }
  };

  subscribe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const payload = subscribeSchema.parse(req.body);
      const sub = await this.service.subscribe(tenantId, payload);
      res.status(201).json({ success: true, data: sub, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  getSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const result = await this.service.getSubscription(tenantId);
      const data = result ? { ...result.sub, plan: result.plan, invoices: result.invoices } : null;
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  listInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const data = await this.service.listInvoices(tenantId);
      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      await this.service.cancel(tenantId);
      res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    } catch (e) { next(e); }
  };
}