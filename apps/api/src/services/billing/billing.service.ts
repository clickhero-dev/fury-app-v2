import { AppError } from '../../middleware/errorHandler.js';
import { SubscriptionRepository } from '../../repository/subscription.repository.js';
import {
  createCustomer,
  updateCustomer,
  findCustomerByExternalReference,
  createSubscription,
  cancelSubscription,
  getPayment,
} from './asaas.service.js';

interface AsaasLike {
  createCustomer: typeof createCustomer;
  updateCustomer: typeof updateCustomer;
  findCustomerByExternalReference: typeof findCustomerByExternalReference;
  createSubscription: typeof createSubscription;
  cancelSubscription: typeof cancelSubscription;
  getPayment: typeof getPayment;
}

export interface SubscribePayload {
  planId: string;
  billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD';
  customerName: string;
  customerEmail: string;
  customerCpfCnpj: string;
}

export interface WebhookEvent {
  event: string;
  payment?: { id: string; status: string; subscription?: string };
}

export class BillingService {
  constructor(
    private repoFactory: (tenantId: string) => SubscriptionRepository = (t) => new SubscriptionRepository(t),
    private asaas: AsaasLike = {
      createCustomer,
      updateCustomer,
      findCustomerByExternalReference,
      createSubscription,
      cancelSubscription,
      getPayment,
    },
  ) {}

  private repo(tenantId: string): SubscriptionRepository {
    return this.repoFactory(tenantId);
  }

  async listActivePlans() {
    return this.repo('').listActivePlans();
  }

  async handleWebhook(event: WebhookEvent): Promise<boolean> {
    if (!event?.payment?.id) return false;
    const payment = await this.asaas.getPayment(event.payment.id);

    if (event.payment.subscription) {
      const repo = this.repo('');
      const sub = await repo.findSubscriptionByAsaasId(event.payment.subscription);
      if (sub) {
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

        if (isPaid && sub.status !== 'active') {
          const nextPeriod = new Date();
          nextPeriod.setMonth(nextPeriod.getMonth() + 1);
          await repo.patchSubscription(sub.id, { status: 'active', currentPeriodEnd: nextPeriod });
        } else if (isOverdue) {
          await repo.patchSubscription(sub.id, { status: 'past_due' });
        }
      }
    }
    return true;
  }

  async subscribe(tenantId: string, payload: SubscribePayload) {
    const plan = await this.repo('').findPlanById(payload.planId, true);
    if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plano não encontrado');

    const now = new Date();
    const existing = await this.repo(tenantId).findSubscription();
    if (existing) {
      const isExpired =
        ['cancelled', 'inactive', 'past_due'].includes(existing.status) ||
        (existing.status === 'trial' && existing.trialEndsAt && now > existing.trialEndsAt) ||
        (existing.status === 'active' && existing.currentPeriodEnd && now > existing.currentPeriodEnd);
      if (isExpired) throw new AppError(403, 'SUBSCRIPTION_EXPIRED', 'Sua assinatura está vencida. Entre em contato com o suporte.');
      throw new AppError(409, 'ALREADY_SUBSCRIBED', 'Tenant já possui assinatura ativa');
    }

    let asaasCustomer = await this.asaas.findCustomerByExternalReference(tenantId);
    if (!asaasCustomer) {
      asaasCustomer = await this.asaas.createCustomer({
        name: payload.customerName,
        email: payload.customerEmail,
        cpfCnpj: payload.customerCpfCnpj,
        externalReference: tenantId,
      });
    } else if (!asaasCustomer.cpfCnpj && payload.customerCpfCnpj) {
      asaasCustomer = await this.asaas.updateCustomer(asaasCustomer.id, { cpfCnpj: payload.customerCpfCnpj });
    }

    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);
    const nextDueDateStr = nextDueDate.toISOString().split('T')[0]!;

    const asaasSub = await this.asaas.createSubscription({
      customer: asaasCustomer.id,
      billingType: payload.billingType,
      cycle: plan.interval === 'yearly' ? 'YEARLY' : 'MONTHLY',
      value: plan.priceCents / 100,
      nextDueDate: nextDueDateStr,
      description: `FURY ${plan.name}`,
      externalReference: tenantId,
    });

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);
    return this.repo(tenantId).createSubscription({
      tenantId,
      planId: plan.id,
      asaasSubscriptionId: asaasSub.id,
      asaasCustomerId: asaasCustomer.id,
      status: 'trial',
      trialEndsAt: trialEnd,
    });
  }

  async getSubscription(tenantId: string) {
    const repo = this.repo(tenantId);
    let sub;
    try {
      sub = await repo.findSubscription();
    } catch (dbErr: any) {
      console.error('[billing] subscriptions query failed:', dbErr?.message ?? dbErr);
      return null;
    }
    if (!sub) return null;

    let plan = null;
    let recentInvoices: unknown[] = [];
    try { plan = await repo.findPlanById(sub.planId); } catch (dbErr: any) { console.error('[billing] plans query failed:', dbErr?.message ?? dbErr); }
    try { recentInvoices = await repo.findRecentInvoicesBySubscription(sub.id); } catch (dbErr: any) { console.error('[billing] invoices query failed:', dbErr?.message ?? dbErr); }

    return { sub, plan, invoices: recentInvoices };
  }

  async listInvoices(tenantId: string) {
    const tenantInvoices = await this.repo(tenantId).findInvoicesByTenant();
    const isProduction = process.env.ASAAS_ENV === 'production';
    const asaasInvoiceBaseUrl = isProduction ? 'https://www.asaas.com/i' : 'https://sandbox.asaas.com/i';
    return tenantInvoices.map((invoice) => ({
      id: invoice.id,
      amountCents: invoice.amountCents,
      status: invoice.status,
      paidAt: invoice.paidAt,
      asaasPaymentId: invoice.asaasPaymentId,
      createdAt: invoice.createdAt,
      invoiceUrl: invoice.asaasPaymentId ? `${asaasInvoiceBaseUrl}/${invoice.asaasPaymentId}` : null,
    }));
  }

  async cancel(tenantId: string) {
    const sub = await this.repo(tenantId).findActiveSubscription();
    if (!sub) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Assinatura ativa não encontrada');
    if (sub.asaasSubscriptionId) await this.asaas.cancelSubscription(sub.asaasSubscriptionId);
    await this.repo(tenantId).patchSubscription(sub.id, { status: 'cancelled' });
  }
}