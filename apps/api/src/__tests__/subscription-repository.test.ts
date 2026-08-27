import { describe, it, expect, vi } from 'vitest';
import { SubscriptionRepository } from '../repository/subscription.repository.js';

/** Testes unitários do SubscriptionRepository — injeta `db` mockado no construtor. */

function makeDb() {
  const update = vi.fn(() => ({
    set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'sub-1', ...s }] }) }),
  }));
  const insert = vi.fn(() => ({
    values: (v: any) => ({ returning: async () => [{ id: 'row-1', ...v }] }),
  }));
  const db: any = {
    query: {
      subscriptions: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      plans: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      invoices: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      budgetOptimizations: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      creativeAssets: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    },
    update,
    insert,
    delete: vi.fn(() => ({ where: async () => {} })),
  };
  return { db, update, insert };
}

const tenantId = 'c3d2e1f0-0000-4000-8000-00000000000c';

describe('SubscriptionRepository', () => {
  it('findSubscription consulta subscriptions por tenant (mais recente)', async () => {
    const { db } = makeDb();
    const repo = new SubscriptionRepository(tenantId, db);
    await repo.findSubscription();
    expect(db.query.subscriptions.findFirst).toHaveBeenCalledTimes(1);
  });

  it('listActivePlans consulta plans.findMany (GLOBAL)', async () => {
    const { db } = makeDb();
    const repo = new SubscriptionRepository('', db);
    await repo.listActivePlans();
    expect(db.query.plans.findMany).toHaveBeenCalledTimes(1);
  });

  it('findSubscriptionByAsaasId consulta por asaasSubscriptionId (GLOBAL)', async () => {
    const { db } = makeDb();
    const repo = new SubscriptionRepository('', db);
    await repo.findSubscriptionByAsaasId('asaas-1');
    expect(db.query.subscriptions.findFirst).toHaveBeenCalledTimes(1);
  });

  it('createSubscription insere e retorna a assinatura', async () => {
    const { db, insert } = makeDb();
    const repo = new SubscriptionRepository(tenantId, db);
    const sub = await repo.createSubscription({ tenantId, planId: 'p-1', status: 'trial' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(sub.tenantId).toBe(tenantId);
  });

  it('createInvoice insere invoice (GLOBAL / webhook)', async () => {
    const { db, insert } = makeDb();
    const repo = new SubscriptionRepository('', db);
    const inv = await repo.createInvoice({ tenantId, subscriptionId: 'sub-1', amountCents: 1000, status: 'pending' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(inv.subscriptionId).toBe('sub-1');
  });

  it('findInvoicesByTenant consulta invoices por tenant', async () => {
    const { db } = makeDb();
    const repo = new SubscriptionRepository(tenantId, db);
    await repo.findInvoicesByTenant();
    expect(db.query.invoices.findMany).toHaveBeenCalledTimes(1);
  });

  it('createBudgetOptimization insere budgetOptimization', async () => {
    const { db, insert } = makeDb();
    const repo = new SubscriptionRepository(tenantId, db);
    const rec = await repo.createBudgetOptimization({ tenantId, totalBudget: '1000', adjustments: [], mode: 'suggestion', status: 'pending' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(rec.tenantId).toBe(tenantId);
  });
});