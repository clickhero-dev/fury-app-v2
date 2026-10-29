import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';

/**
 * INTEGRAÇÃO (app real + banco de teste + Redis local) — planos do parceiro.
 * Cada dono vê e usa só os próprios planos; assinatura sempre com plano do dono do cliente.
 */
describe('Planos do parceiro — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  const planIds: string[] = [];
  let superToken: string;
  let tokenA: string;
  let partnerA: string;
  let partnerB: string;
  let clientA: string;
  let clientAToken: string;
  let clientB: string;
  let clientAdy: string;
  let clientAdyToken: string;
  let planA: string;
  let planB: string;
  let planAdy: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const subOf = async (tenantId: string) =>
    (await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.tenantId, tenantId)))[0];

  async function register(tag: string) {
    const email = `pp-${tag}-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'PP', email, password, companyName: `PP ${tag} ${id}` });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data as { token: string; user: { id: string; tenantId: string } };
  }

  async function newPartner(tag: string) {
    const [p] = await db.insert(schema.adyPartners).values({ name: `PP ${tag} ${id}`, maxTenants: 5 }).returning();
    partnerIds.push(p!.id);
    return p!.id;
  }

  async function plan(name: string, partnerId: string | null) {
    const [p] = await db.insert(schema.plans)
      .values({ name: `${name} ${id}`, priceCents: 100, interval: 'monthly', partnerId, limits: { creativesPerMonth: 7 } })
      .returning();
    planIds.push(p!.id);
    return p!.id;
  }

  async function client(tag: string, partnerId: string | null) {
    const c = await register(tag);
    await db.update(schema.tenants).set({ partnerId }).where(eq(schema.tenants.id, c.user.tenantId));
    if (partnerId) await db.update(schema.users).set({ platformRole: 'user_partner' }).where(eq(schema.users.id, c.user.id));
    return c;
  }

  beforeAll(async () => {
    partnerA = await newPartner('A');
    partnerB = await newPartner('B');

    const sup = await register('super');
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    superToken = sup.token;

    const acc = await register('partner-a');
    await db.update(schema.users).set({ platformRole: 'admin_partner', partnerId: partnerA }).where(eq(schema.users.id, acc.user.id));
    tokenA = acc.token;

    const a = await client('cli-a', partnerA);
    clientA = a.user.tenantId;
    clientAToken = a.token;
    clientB = (await client('cli-b', partnerB)).user.tenantId;
    const ady = await client('cli-ady', null);
    clientAdy = ady.user.tenantId;
    clientAdyToken = ady.token;

    planB = await plan('Plano B', partnerB);
    planAdy = await plan('Plano ady', null);
    await rbacService.bumpVersion();
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.plans).where(inArray(schema.plans.id, planIds));
    await db.delete(schema.plans).where(inArray(schema.plans.partnerId, partnerIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await rbacService.bumpVersion();
  });

  it('parceiro cria plano sempre dele, mesmo mandando outro parceiro no body', async () => {
    const res = await request(app).post('/api/admin/plans').set(bearer(tokenA))
      .send({ name: `Plano A ${id}`, priceCents: 5000, partnerId: partnerB, limits: { creativesPerMonth: 9 } });
    expect(res.status).toBe(201);
    planA = res.body.data.id;
    planIds.push(planA);
    expect(res.body.data.partnerId).toBe(partnerA);
  });

  it('cada um lista só os seus planos', async () => {
    const mine = (await request(app).get('/api/admin/plans').set(bearer(tokenA))).body.data.map((p: { id: string }) => p.id);
    expect(mine).toEqual([planA]);
    const sup = (await request(app).get('/api/admin/plans').set(bearer(superToken))).body.data.map((p: { id: string }) => p.id);
    expect(sup).toContain(planAdy);
    expect(sup).not.toContain(planA);
    expect(sup).not.toContain(planB);
  });

  it('plano de outro dono: 404 e nada muda (inclui super em plano de parceiro)', async () => {
    for (const other of [planB, planAdy, 'nao-e-uuid', '00000000-0000-0000-0000-000000000000']) {
      expect((await request(app).patch(`/api/admin/plans/${other}`).set(bearer(tokenA)).send({ name: 'X' })).status).toBe(404);
      expect((await request(app).delete(`/api/admin/plans/${other}`).set(bearer(tokenA))).status).toBe(404);
    }
    expect((await request(app).patch(`/api/admin/plans/${planA}`).set(bearer(superToken)).send({ name: 'X' })).status).toBe(404);
    const [b] = await db.select().from(schema.plans).where(eq(schema.plans.id, planB));
    expect(b?.name).toBe(`Plano B ${id}`);
    expect((await request(app).patch(`/api/admin/plans/${planA}`).set(bearer(tokenA)).send({ name: `Plano A2 ${id}` })).status).toBe(200);
  });

  it('assinatura: só plano do dono do cliente, só cliente próprio', async () => {
    const put = (tenantId: string, body: object, token = tokenA) =>
      request(app).patch(`/api/admin/tenants/${tenantId}/subscription`).set(bearer(token)).send(body);

    for (const other of [planB, planAdy]) {
      const res = await put(clientA, { planId: other, status: 'active' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PLAN_NOT_FOUND');
    }
    expect(await subOf(clientA)).toBeUndefined();
    expect((await put(clientB, { planId: planA, status: 'active' })).status).toBe(404);
    expect((await put(clientAdy, { planId: planA, status: 'active' })).status).toBe(404);

    // billingType (Asaas) é ignorado para o parceiro
    expect((await put(clientA, { planId: planA, status: 'active', billingType: 'PIX', isNonExpirable: true })).status).toBe(200);
    expect(await subOf(clientA)).toMatchObject({ planId: planA, status: 'active', isNonExpirable: true, creativesRemaining: 9, asaasSubscriptionId: null });

    // super também segue a regra: plano ady não vai para cliente de parceiro
    expect((await put(clientA, { planId: planAdy }, superToken)).status).toBe(404);
    expect((await put(clientAdy, { planId: planAdy, status: 'active' }, superToken)).status).toBe(200);
  });

  it('renovar cota: cliente próprio sim, de outro não', async () => {
    expect((await request(app).post(`/api/admin/tenants/${clientA}/reset-quota`).set(bearer(tokenA))).status).toBe(200);
    expect((await request(app).post(`/api/admin/tenants/${clientB}/reset-quota`).set(bearer(tokenA))).status).toBe(404);
  });

  it('planos que dá para atribuir: os do dono do cliente', async () => {
    const own = await request(app).get(`/api/admin/tenants/${clientA}/assignable-plans`).set(bearer(tokenA));
    expect(own.body.data.map((p: { id: string }) => p.id)).toEqual([planA]);
    expect((await request(app).get(`/api/admin/tenants/${clientB}/assignable-plans`).set(bearer(tokenA))).status).toBe(404);
    const sup = await request(app).get(`/api/admin/tenants/${clientB}/assignable-plans`).set(bearer(superToken));
    expect(sup.body.data.map((p: { id: string }) => p.id)).toEqual([planB]);
  });

  it('Novo Cliente com plano: próprio cria com assinatura; de outro dono recusa e não cria', async () => {
    const body = (planId: string, tag: string) => ({ name: `PP novo ${tag} ${id}`, userName: 'Dono', userEmail: `pp-novo-${tag}-${id}@test.com`, userPassword: password, planId });
    const bad = await request(app).post('/api/admin/my-partner/clients').set(bearer(tokenA)).send(body(planB, 'x'));
    expect(bad.status).toBe(404);
    expect(await db.select().from(schema.users).where(eq(schema.users.email, `pp-novo-x-${id}@test.com`))).toEqual([]);

    const ok = await request(app).post('/api/admin/my-partner/clients').set(bearer(tokenA)).send(body(planA, 'y'));
    expect(ok.status).toBe(201);
    tenantIds.push(ok.body.data.tenant.id);
    expect(await subOf(ok.body.data.tenant.id)).toMatchObject({ planId: planA, status: 'active' });
  });

  it('tela de planos do cliente: só os do dono; exige login; parceiro não paga pela ady', async () => {
    const forA = (await request(app).get('/api/billing/plans').set(bearer(clientAToken))).body.data.map((p: { id: string }) => p.id);
    expect(forA).toEqual([planA]);
    const forAdy = (await request(app).get('/api/billing/plans').set(bearer(clientAdyToken))).body.data.map((p: { id: string }) => p.id);
    expect(forAdy).toContain(planAdy);
    expect(forAdy).not.toContain(planA);
    expect(forAdy).not.toContain(planB);
    expect((await request(app).get('/api/billing/plans')).status).toBe(401);

    const sub = await request(app).post('/api/billing/subscribe').set(bearer(clientAToken))
      .send({ planId: planA, customerName: 'Cli', customerEmail: 'c@c.com', customerCpfCnpj: '12345678909' });
    expect(sub.status).toBe(403);
    expect(sub.body.error.code).toBe('PARTNER_MANAGED');
  });
});
