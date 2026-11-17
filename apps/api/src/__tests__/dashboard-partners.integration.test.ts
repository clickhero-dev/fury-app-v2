import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';
import { daysAgoSaoPauloYMD } from '../utils/date-sao-paulo.js';

/**
 * INTEGRAÇÃO — Dashboard do super em 2 abas:
 * "Clientes ady" não conta parceiro (nem a conta própria dele); "Parceiros" soma pagamento, vagas e clientes.
 */
describe('Dashboard Clientes ady × Parceiros — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const planIds: string[] = [];
  let superToken: string;
  let partnerToken: string;
  let partnerId: string;
  let ownTenantName: string;
  const clientName = `Cliente do Parceiro ${id}`;
  const planName = `Plano Parceiro ${id}`;

  const asSuper = () => ({ Authorization: `Bearer ${superToken}` });
  const login = (email: string) => request(app).post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    const email = `dp-super-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'Super', email, password, companyName: `DP ${id}` });
    const sup = (await login(email)).body.data;
    tenantIds.push(sup.user.tenantId);
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    await rbacService.bumpVersion();
    superToken = sup.token;

    const created = await request(app).post('/api/admin/partners').set(asSuper()).send({
      name: `Parceiro DP ${id}`, maxTenants: 3, accountName: 'Dona', accountEmail: `dp-acc-${id}@test.com`, accountPassword: password,
    });
    partnerId = created.body.data.id;
    const [acc] = await db.select().from(schema.users).where(eq(schema.users.email, `dp-acc-${id}@test.com`));
    tenantIds.push(acc!.tenantId);
    ownTenantName = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, acc!.tenantId)))[0]!.name;
    partnerToken = (await login(`dp-acc-${id}@test.com`)).body.data.token;

    // cliente do parceiro com assinatura ativa num plano do parceiro
    const [plan] = await db.insert(schema.plans).values({ name: planName, priceCents: 99900, partnerId }).returning();
    planIds.push(plan!.id);
    const [tenant] = await db.insert(schema.tenants).values({ name: clientName, slug: `dp-cli-${id}`, partnerId }).returning();
    tenantIds.push(tenant!.id);
    await db.insert(schema.subscriptions).values({
      tenantId: tenant!.id, planId: plan!.id, status: 'active', currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
    });

    await request(app).post(`/api/admin/partners/${partnerId}/payment`).set(asSuper())
      .send({ paidAt: daysAgoSaoPauloYMD(2), amountCents: 1234500 });
  });

  afterAll(async () => {
    await db.delete(schema.subscriptions).where(inArray(schema.subscriptions.tenantId, tenantIds));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.plans).where(inArray(schema.plans.id, planIds));
    await db.delete(schema.adyPartnerPayments).where(eq(schema.adyPartnerPayments.partnerId, partnerId));
    await db.delete(schema.adyPartners).where(eq(schema.adyPartners.id, partnerId));
    await rbacService.bumpVersion();
  });

  it('Clientes ady: plano e cliente do parceiro ficam de fora (inclusive do MRR)', async () => {
    const res = await request(app).get('/api/admin/dashboard?period=7d').set(asSuper());
    expect(res.status).toBe(200);
    const names = (res.body.data.plans as { name: string }[]).map((p) => p.name);
    expect(names).not.toContain(planName);
    const activity = (res.body.data.recentActivity as { tenantName: string }[]).map((a) => a.tenantName);
    expect(activity).not.toContain(clientName);
    // conta própria do parceiro não é cliente da ady
    expect(activity).not.toContain(ownTenantName);
  });

  it('parceiro continua vendo só os clientes dele no dashboard', async () => {
    const res = await request(app).get('/api/admin/dashboard?period=7d').set({ Authorization: `Bearer ${partnerToken}` });
    expect(res.status).toBe(200);
    expect(res.body.data.activeClients).toBe(1);
    expect(res.body.data.mrrCents).toBe(99900);
  });

  it('Parceiros: receita, vagas e clientes do parceiro', async () => {
    const res = await request(app).get('/api/admin/dashboard/partners?period=7d').set(asSuper());
    expect(res.status).toBe(200);
    const row = (res.body.data.partners as { id: string }[]).find((p) => p.id === partnerId);
    expect(row).toEqual({
      id: partnerId, name: `Parceiro DP ${id}`, paidCents: 1234500, paidAt: daysAgoSaoPauloYMD(2),
      usedTenants: 1, maxTenants: 3, activeClients: 1, aiKeyConfigured: false,
    });
    expect(res.body.data.revenueCents).toBeGreaterThanOrEqual(1234500);
    expect(res.body.data.slotsTotal).toBeGreaterThanOrEqual(3);
    expect(res.body.data.newPartners).toBeGreaterThanOrEqual(1);
  });

  it('período sem o pagamento não soma (pagamento fora da janela)', async () => {
    await db.update(schema.adyPartnerPayments).set({ paidAt: daysAgoSaoPauloYMD(40) }).where(eq(schema.adyPartnerPayments.partnerId, partnerId));
    const r7 = (await request(app).get('/api/admin/dashboard/partners?period=7d').set(asSuper())).body.data;
    const r90 = (await request(app).get('/api/admin/dashboard/partners?period=90d').set(asSuper())).body.data;
    expect(r90.revenueCents - r7.revenueCents).toBeGreaterThanOrEqual(1234500);
  });

  it('parceiro não acessa a aba Parceiros: 403', async () => {
    const res = await request(app).get('/api/admin/dashboard/partners').set({ Authorization: `Bearer ${partnerToken}` });
    expect(res.status).toBe(403);
  });
});
