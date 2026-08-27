import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { AppError } from '../middleware/errorHandler.js';
import { SubscriptionRepository } from '../repository/subscription.repository.js';
import {
  createCustomer,
  updateCustomer,
  findCustomerByExternalReference,
  createSubscription,
  cancelSubscription,
  getPayment,
} from '../services/billing/asaas.service.js';

const router = Router();

// ──────────────────────────────────────────────
// Public
// ──────────────────────────────────────────────

router.get('/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const activePlans = await new SubscriptionRepository('').listActivePlans();
    res.json({ success: true, data: activePlans, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Webhook (no auth — validated by token header)
// ──────────────────────────────────────────────

router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers['asaas-access-token'] as string | undefined;
    if (!token || token !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const event = req.body as {
      event: string;
      payment?: { id: string; status: string; subscription?: string };
    };

    if (!event?.payment?.id) return res.json({ received: true });

    const payment = await getPayment(event.payment.id);

    // Find subscription by asaas_subscription_id
    if (event.payment.subscription) {
      const repo = new SubscriptionRepository('');
      const sub = await repo.findSubscriptionByAsaasId(event.payment.subscription);

      if (sub) {
        // Upsert invoice
        const existingInvoice = await repo.findInvoiceByPaymentId(payment.id);

        const isPaid = payment.status === 'RECEIVED' || payment.status === 'CONFIRMED';
        const isOverdue = payment.status === 'OVERDUE';

        if (!existingInvoice) {
          await repo.createInvoice({
            tenantId: sub.tenantId,
            subscriptionId: sub.id,
            asaasPaymentId: payment.id,
            amountCents: Math.round(payment.value * 100),
            status: isPaid ? 'paid' : isOverdue ? 'overdue' : 'pending',
            paidAt: isPaid ? new Date() : undefined,
          });
        } else if (isPaid && existingInvoice.status !== 'paid') {
          await repo.patchInvoice(existingInvoice.id, { status: 'paid', paidAt: new Date() });
        } else if (isOverdue) {
          await repo.patchInvoice(existingInvoice.id, { status: 'overdue' });
        }

        // Update subscription status
        if (isPaid && sub.status !== 'active') {
          const nextPeriod = new Date();
          nextPeriod.setMonth(nextPeriod.getMonth() + 1);
          await repo.patchSubscription(sub.id, { status: 'active', currentPeriodEnd: nextPeriod });
        } else if (isOverdue) {
          await repo.patchSubscription(sub.id, { status: 'past_due' });
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Protected (auth + tenant required)
// ──────────────────────────────────────────────

router.use(authMiddleware, tenantMiddleware);

const subscribeSchema = z.object({
  planId: z.string().uuid(),
  billingType: z.enum(['BOLETO', 'PIX', 'CREDIT_CARD']).default('PIX'),
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  customerCpfCnpj: z
    .string()
    .min(11, 'CPF ou CNPJ é obrigatório')
    .transform((v) => v.replace(/\D/g, '')),
});

router.post('/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const payload = subscribeSchema.parse(req.body);

    // Check plan exists
    const plan = await new SubscriptionRepository('').findPlanById(payload.planId, true);
    if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plano não encontrado');

    // Check existing subscription — if expired, block new subscription
    const existing = await new SubscriptionRepository(tenantId).findSubscription();
    if (existing) {
      const now = new Date();
      const isExpired =
        ['cancelled', 'inactive', 'past_due'].includes(existing.status) ||
        (existing.status === 'trial' && existing.trialEndsAt && now > existing.trialEndsAt) ||
        (existing.status === 'active' && existing.currentPeriodEnd && now > existing.currentPeriodEnd);

      if (isExpired) {
        throw new AppError(403, 'SUBSCRIPTION_EXPIRED', 'Sua assinatura está vencida. Entre em contato com o suporte.');
      }

      // If active/trial within validity, block as already subscribed
      throw new AppError(409, 'ALREADY_SUBSCRIBED', 'Tenant já possui assinatura ativa');
    }

    // Get or create Asaas customer; patch CPF if missing
    let asaasCustomer = await findCustomerByExternalReference(tenantId);
    if (!asaasCustomer) {
      asaasCustomer = await createCustomer({
        name: payload.customerName,
        email: payload.customerEmail,
        cpfCnpj: payload.customerCpfCnpj,
        externalReference: tenantId,
      });
    } else if (!asaasCustomer.cpfCnpj && payload.customerCpfCnpj) {
      asaasCustomer = await updateCustomer(asaasCustomer.id, {
        cpfCnpj: payload.customerCpfCnpj,
      });
    }

    // Create Asaas subscription
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);
    const nextDueDateStr = nextDueDate.toISOString().split('T')[0]!;

    const asaasSub = await createSubscription({
      customer: asaasCustomer.id,
      billingType: payload.billingType,
      cycle: plan.interval === 'yearly' ? 'YEARLY' : 'MONTHLY',
      value: plan.priceCents / 100,
      nextDueDate: nextDueDateStr,
      description: `FURY ${plan.name}`,
      externalReference: tenantId,
    });

    // Persist subscription
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    const sub = await new SubscriptionRepository(tenantId).createSubscription({
      tenantId,
      planId: plan.id,
      asaasSubscriptionId: asaasSub.id,
      asaasCustomerId: asaasCustomer.id,
      status: 'trial',
      trialEndsAt: trialEnd,
    });

    res.status(201).json({ success: true, data: sub, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

router.get('/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;
    const repo = new SubscriptionRepository(tenantId);

    let sub;
    try {
      sub = await repo.findSubscription();
    } catch (dbErr: any) {
      // Table may not exist (migration not applied) or DB error — treat as no subscription
      console.error('[billing] subscriptions query failed:', dbErr?.message ?? dbErr);
      return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    }

    if (!sub) return res.json({ success: true, data: null, timestamp: new Date().toISOString() });

    let plan = null;
    let recentInvoices: unknown[] = [];

    try {
      plan = await repo.findPlanById(sub.planId);
    } catch (dbErr: any) {
      console.error('[billing] plans query failed:', dbErr?.message ?? dbErr);
    }

    try {
      recentInvoices = await repo.findRecentInvoicesBySubscription(sub.id);
    } catch (dbErr: any) {
      console.error('[billing] invoices query failed:', dbErr?.message ?? dbErr);
    }

    res.json({
      success: true,
      data: { ...sub, plan, invoices: recentInvoices },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/invoices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;

    const tenantInvoices = await new SubscriptionRepository(tenantId).findInvoicesByTenant();

    const isProduction = process.env.ASAAS_ENV === 'production';
    const asaasInvoiceBaseUrl = isProduction
      ? 'https://www.asaas.com/i'
      : 'https://sandbox.asaas.com/i';

    const data = tenantInvoices.map((invoice) => ({
      id: invoice.id,
      amountCents: invoice.amountCents,
      status: invoice.status,
      paidAt: invoice.paidAt,
      asaasPaymentId: invoice.asaasPaymentId,
      createdAt: invoice.createdAt,
      invoiceUrl: invoice.asaasPaymentId
        ? `${asaasInvoiceBaseUrl}/${invoice.asaasPaymentId}`
        : null,
    }));

    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

router.delete('/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;

    const sub = await new SubscriptionRepository(tenantId).findActiveSubscription();
    if (!sub) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Assinatura ativa não encontrada');

    if (sub.asaasSubscriptionId) {
      await cancelSubscription(sub.asaasSubscriptionId);
    }

    await new SubscriptionRepository(tenantId).patchSubscription(sub.id, { status: 'cancelled' });

    res.json({ success: true, data: null, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
