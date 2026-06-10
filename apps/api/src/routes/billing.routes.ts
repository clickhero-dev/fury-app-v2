import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, plans, subscriptions, invoices } from '@fury/db';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  createCustomer,
  updateCustomer,
  findCustomerByExternalReference,
  createSubscription,
  cancelSubscription,
  getPayment,
} from '../services/asaas.service.js';

const router = Router();

// ──────────────────────────────────────────────
// Public
// ──────────────────────────────────────────────

router.get('/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const activePlans = await db.query.plans.findMany({
      where: eq(plans.isActive, true),
      orderBy: [plans.priceCents],
    });
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
      const sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.asaasSubscriptionId, event.payment.subscription),
      });

      if (sub) {
        // Upsert invoice
        const existingInvoice = await db.query.invoices.findFirst({
          where: eq(invoices.asaasPaymentId, payment.id),
        });

        const isPaid = payment.status === 'RECEIVED' || payment.status === 'CONFIRMED';
        const isOverdue = payment.status === 'OVERDUE';

        if (!existingInvoice) {
          await db.insert(invoices).values({
            tenantId: sub.tenantId,
            subscriptionId: sub.id,
            asaasPaymentId: payment.id,
            amountCents: Math.round(payment.value * 100),
            status: isPaid ? 'paid' : isOverdue ? 'overdue' : 'pending',
            paidAt: isPaid ? new Date() : undefined,
          });
        } else if (isPaid && existingInvoice.status !== 'paid') {
          await db
            .update(invoices)
            .set({ status: 'paid', paidAt: new Date() })
            .where(eq(invoices.id, existingInvoice.id));
        } else if (isOverdue) {
          await db
            .update(invoices)
            .set({ status: 'overdue' })
            .where(eq(invoices.id, existingInvoice.id));
        }

        // Update subscription status
        if (isPaid && sub.status !== 'active') {
          const nextPeriod = new Date();
          nextPeriod.setMonth(nextPeriod.getMonth() + 1);
          await db
            .update(subscriptions)
            .set({ status: 'active', currentPeriodEnd: nextPeriod, updatedAt: new Date() })
            .where(eq(subscriptions.id, sub.id));
        } else if (isOverdue) {
          await db
            .update(subscriptions)
            .set({ status: 'past_due', updatedAt: new Date() })
            .where(eq(subscriptions.id, sub.id));
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
    const plan = await db.query.plans.findFirst({
      where: and(eq(plans.id, payload.planId), eq(plans.isActive, true)),
    });
    if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plano não encontrado');

    // Check existing active subscription
    const existing = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.status, 'active')
      ),
    });
    if (existing) throw new AppError(409, 'ALREADY_SUBSCRIBED', 'Tenant já possui assinatura ativa');

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

    const [sub] = await db
      .insert(subscriptions)
      .values({
        tenantId,
        planId: plan.id,
        asaasSubscriptionId: asaasSub.id,
        asaasCustomerId: asaasCustomer.id,
        status: 'trial',
        trialEndsAt: trialEnd,
      })
      .returning();

    res.status(201).json({ success: true, data: sub, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

router.get('/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId } = req.tenant!;

    let sub;
    try {
      sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.tenantId, tenantId),
        orderBy: [desc(subscriptions.createdAt)],
      });
    } catch (dbErr: any) {
      // Table may not exist (migration not applied) or DB error — treat as no subscription
      console.error('[billing] subscriptions query failed:', dbErr?.message ?? dbErr);
      return res.json({ success: true, data: null, timestamp: new Date().toISOString() });
    }

    if (!sub) return res.json({ success: true, data: null, timestamp: new Date().toISOString() });

    let plan = null;
    let recentInvoices: unknown[] = [];

    try {
      plan = await db.query.plans.findFirst({ where: eq(plans.id, sub.planId) });
    } catch (dbErr: any) {
      console.error('[billing] plans query failed:', dbErr?.message ?? dbErr);
    }

    try {
      recentInvoices = await db.query.invoices.findMany({
        where: eq(invoices.subscriptionId, sub.id),
        orderBy: [desc(invoices.createdAt)],
        limit: 12,
      });
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

    const tenantInvoices = await db.query.invoices.findMany({
      where: eq(invoices.tenantId, tenantId),
      orderBy: [desc(invoices.createdAt)],
      limit: 12,
    });

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

    const sub = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.tenantId, tenantId),
        inArray(subscriptions.status, ['active', 'trial'])
      ),
    });
    if (!sub) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Assinatura ativa não encontrada');

    if (sub.asaasSubscriptionId) {
      await cancelSubscription(sub.asaasSubscriptionId);
    }

    await db
      .update(subscriptions)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));

    res.json({ success: true, data: null, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
