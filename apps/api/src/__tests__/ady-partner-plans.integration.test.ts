import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';

/**
 * INTEGRAÇÃO — planos de parceiro (pacote único: vagas + telas), só super_admin.
 */
describe('Planos de parceiro — integração', () => {
  const id = Date.now().toString().slice(-8);
  // todo parceiro nasce com plano
  let partnerPlanId: string;
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  const planIds: string[] = [];
  let superToken: string;
  let partnerToken: string;

  const asSuper = () => ({ Authorization: `Bearer ${superToken}` });
  const login = (email: string) => request(app).post('/api/auth/login').send({ email, password });
  const base = '/api/admin/partner-plans';
  const ouro = () => ({ name: `Ouro ${id}`, priceCents: 249990, maxTenants: 5, blockedViews: ['calendar'] });

  async function create(body: Record<string, unknown>) {
    const res = await request(app).post(base).set(asSuper()).send(body);
    if (res.status === 201) planIds.push(res.body.data.id);
    return res;
  }

  beforeAll(async () => {
    const [pl] = await db.insert(schema.adyPartnerPlans).values({ name: `Plano ppl ${id}`, priceCents: 100000, maxTenants: 5 }).returning();
    partnerPlanId = pl!.id;
    const email = `ppl-super-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'Super', email, password, companyName: `PPL ${id}` });
    const sup = (await login(email)).body.data;
    tenantIds.push(sup.user.tenantId);
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    await rbacService.bumpVersion();
    superToken = sup.token;

    const created = await request(app).post('/api/admin/partners').set(asSuper()).send({
      name: `PPL Parceiro ${id}`, maxTenants: 2, accountName: 'Dona', accountEmail: `ppl-acc-${id}@test.com`, accountPassword: password, partnerPlanId,
    });
    partnerIds.push(created.body.data.id);
    const [acc] = await db.select().from(schema.users).where(eq(schema.users.email, `ppl-acc-${id}@test.com`));
    tenantIds.push(acc!.tenantId);
    partnerToken = (await login(`ppl-acc-${id}@test.com`)).body.data.token;
  });

  afterAll(async () => {
    await db.update(schema.adyPartners).set({ partnerPlanId: null }).where(inArray(schema.adyPartners.id, partnerIds));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    if (planIds.length) {
      await db.delete(schema.adyRbacAuditLog).where(inArray(schema.adyRbacAuditLog.entityKey, planIds));
      await db.delete(schema.adyPartnerPlans).where(inArray(schema.adyPartnerPlans.id, planIds));
    }
    await db.delete(schema.adyPartnerPlans).where(eq(schema.adyPartnerPlans.id, partnerPlanId));
    await rbacService.bumpVersion();
  });

  it('catálogo de telas não é capturado por /:id e não traz telas do admin', async () => {
    const res = await request(app).get(`${base}/views`).set(asSuper());
    expect(res.status).toBe(200);
    const keys = (res.body.data as { key: string }[]).map((v) => v.key);
    expect(keys).toContain('calendar');
    expect(keys.some((k) => k.startsWith('admin.'))).toBe(false);
  });

  it('cria o plano com vagas, preço e telas; aparece na lista', async () => {
    const res = await create(ouro());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: `Ouro ${id}`, priceCents: 249990, maxTenants: 5, isActive: true, blockedViews: ['calendar'], partnersCount: 0 });

    const list = await request(app).get(base).set(asSuper());
    expect((list.body.data as { id: string }[]).some((p) => p.id === res.body.data.id)).toBe(true);

    const [audit] = await db.select().from(schema.adyRbacAuditLog)
      .where(and(eq(schema.adyRbacAuditLog.entityKey, res.body.data.id), eq(schema.adyRbacAuditLog.action, 'partner_plan_created')));
    expect(audit?.entityType).toBe('partner_plan');
  });

  it('nome repetido (sem diferenciar maiúsculas) = 409', async () => {
    const res = await create({ ...ouro(), name: `OURO ${id}` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLAN_NAME_EXISTS');
  });

  it('tela inválida = 400; filho coberto pelo pai é descartado; repetição some', async () => {
    const bad = await create({ ...ouro(), name: `Bad ${id}`, blockedViews: ['nao-existe'] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_VIEW');

    const admin = await create({ ...ouro(), name: `Adm ${id}`, blockedViews: ['admin.partners'] });
    expect(admin.status).toBe(400);

    const res = await create({ ...ouro(), name: `Prata ${id}`, blockedViews: ['studio.image', 'studio', 'studio', 'calendar'] });
    expect(res.status).toBe(201);
    expect(res.body.data.blockedViews).toEqual(['calendar', 'studio']);
  });

  it('valida preço e vagas com o motivo em português', async () => {
    const cases = [
      { body: { ...ouro(), name: `V1 ${id}`, priceCents: -1 }, msg: /negativo/i },
      { body: { ...ouro(), name: `V2 ${id}`, priceCents: 10.5 }, msg: /centavos/i },
      { body: { ...ouro(), name: `V3 ${id}`, priceCents: 2_147_483_648 }, msg: /21\.474\.836,47/ },
      { body: { ...ouro(), name: `V4 ${id}`, maxTenants: -1 }, msg: /negativas/i },
      { body: { ...ouro(), name: '   ' }, msg: /nome/i },
    ];
    for (const c of cases) {
      const res = await create(c.body);
      expect(res.status, JSON.stringify(c.body)).toBe(400);
      expect(res.body.error.message).toMatch(c.msg);
    }
  });

  it('edita nome, preço, vagas, telas e inativa', async () => {
    const planId = (await create({ ...ouro(), name: `Bronze ${id}` })).body.data.id;
    const res = await request(app).patch(`${base}/${planId}`).set(asSuper())
      .send({ name: `Bronze+ ${id}`, priceCents: 100000, maxTenants: 3, blockedViews: [], isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: `Bronze+ ${id}`, priceCents: 100000, maxTenants: 3, blockedViews: [], isActive: false });

    expect((await request(app).patch(`${base}/${planId}`).set(asSuper()).send({})).status).toBe(400);
    const dup = await request(app).patch(`${base}/${planId}`).set(asSuper()).send({ name: `Ouro ${id}` });
    expect(dup.status).toBe(409);
  });

  it('plano inexistente = 404', async () => {
    expect((await request(app).get(`${base}/00000000-0000-0000-0000-000000000000`).set(asSuper())).status).toBe(404);
    expect((await request(app).patch(`${base}/nao-uuid`).set(asSuper()).send({ priceCents: 1 })).status).toBe(404);
  });

  it('parceiro (admin_partner) nunca acessa: 403; sem login 401', async () => {
    const planId = planIds[0]!;
    for (const call of [
      request(app).get(base),
      request(app).get(`${base}/views`),
      request(app).get(`${base}/${planId}`),
      request(app).post(base).send({ ...ouro(), name: `Hack ${id}` }),
      request(app).patch(`${base}/${planId}`).send({ priceCents: 1 }),
    ]) {
      expect((await call.set({ Authorization: `Bearer ${partnerToken}` })).status).toBe(403);
    }
    expect((await request(app).get(base)).status).toBe(401);
  });
});
