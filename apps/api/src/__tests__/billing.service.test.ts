import { describe, it, expect, vi } from 'vitest';
import { BillingService } from '../services/billing/billing.service.js';

const plan = { id: 'p1', interval: 'monthly', priceCents: 9900, name: 'Pro' };
const subRow = { id: 's1', planId: 'p1', status: 'trial' };

function makeRepo(override: Record<string, any> = {}) {
  const base = {
    listActivePlans: vi.fn(async () => [plan]),
    findPlanById: vi.fn(async () => plan),
    findSubscription: vi.fn(async () => null),
    findSubscriptionByAsaasId: vi.fn(async () => null),
    findInvoiceByPaymentId: vi.fn(async () => null),
    createInvoice: vi.fn(async (d: any) => ({ id: 'inv1', ...d })),
    patchInvoice: vi.fn(async () => {}),
    patchSubscription: vi.fn(async () => {}),
    createSubscription: vi.fn(async (d: any) => ({ ...subRow, ...d })),
    findRecentInvoicesBySubscription: vi.fn(async () => []),
    findInvoicesByTenant: vi.fn(async () => [{ id: 'inv1', amountCents: 9900, status: 'paid', paidAt: new Date(), asaasPaymentId: 'pay1', createdAt: new Date() }]),
    findActiveSubscription: vi.fn(async () => subRow),
    ...override,
  };
  return base;
}
let repo: any = makeRepo();
const asaas: any = {
  getPayment: vi.fn(async () => ({ id: 'pay1', status: 'RECEIVED', value: 99 })),
  findCustomerByExternalReference: vi.fn(async () => ({ id: 'cust1', cpfCnpj: '123' })),
  createCustomer: vi.fn(async () => ({ id: 'cust1' })),
  updateCustomer: vi.fn(async () => ({ id: 'cust1', cpfCnpj: '123' })),
  createSubscription: vi.fn(async () => ({ id: 'asasub1' })),
  cancelSubscription: vi.fn(async () => {}),
};
const svc = new BillingService(() => repo as any, asaas as any);

describe('BillingService', () => {
  it('listActivePlans', async () => {
    await expect(svc.listActivePlans()).resolves.toEqual([plan]);
  });

  it('handleWebhook cria invoice e ativa subscription quando pago', async () => {
    repo = makeRepo({ findSubscriptionByAsaasId: vi.fn(async () => subRow) });
    await svc.handleWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay1', status: 'RECEIVED', subscription: 'asasub1' } });
    expect(repo.createInvoice).toHaveBeenCalledWith(expect.objectContaining({ asaasPaymentId: 'pay1', status: 'paid' }));
    expect(repo.patchSubscription).toHaveBeenCalledWith('s1', expect.objectContaining({ status: 'active' }));
  });

  it('subscribe bloqueia quando já assinatura ativa', async () => {
    repo = makeRepo({ findSubscription: vi.fn(async () => ({ id: 's1', status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) })) });
    await expect(svc.subscribe('t-1', { planId: 'p1', billingType: 'PIX', customerName: 'N', customerEmail: 'e@e.com', customerCpfCnpj: '12345678909' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('subscribe persiste subscription trial', async () => {
    repo = makeRepo();
    const out = await svc.subscribe('t-1', { planId: 'p1', billingType: 'PIX', customerName: 'N', customerEmail: 'e@e.com', customerCpfCnpj: '12345678909' });
    expect(asaas.createSubscription).toHaveBeenCalled();
    expect(repo.createSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: 'trial', asaasSubscriptionId: 'asasub1' }));
    expect(out.status).toBe('trial');
  });

  it('getSubscription trata erro de DB como null', async () => {
    repo = makeRepo({ findSubscription: vi.fn(async () => { throw new Error('boom'); }) });
    await expect(svc.getSubscription('t-1')).resolves.toBeNull();
  });

  it('listInvoices mapeia com invoiceUrl do Asaas', async () => {
    const out = await svc.listInvoices('t-1');
    expect(out[0].invoiceUrl).toContain('/pay1');
  });

  it('cancel cancela no Asaas e marca cancelled', async () => {
    repo = makeRepo({ findActiveSubscription: vi.fn(async () => ({ ...subRow, asaasSubscriptionId: 'asasub1' })) });
    await svc.cancel('t-1');
    expect(asaas.cancelSubscription).toHaveBeenCalledWith('asasub1');
    expect(repo.patchSubscription).toHaveBeenCalledWith('s1', { status: 'cancelled' });
  });
});