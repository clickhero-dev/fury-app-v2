import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';

/**
 * INTEGRAÇÃO — parceiro nasce com plano (cópia de vagas e telas) e parceiro antigo recebe um.
 */
describe('Vincular plano ao parceiro — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  const planIds: string[] = [];
  let superToken: string;
  let ouro: string;
  let pequeno: string;
  let inativo: string;

  const asSuper = () => ({ Authorization: `Bearer ${superToken}` });
  const login = (email: string) => request(app).post('/api/auth/login').send({ email, password });
  const body = (tag: string, extra: Record<string, unknown> = {}) => ({
    name: `PA ${tag} ${id}`, accountName: 'Dona', accountEmail: `pa-${tag}-${id}@test.com`, accountPassword: password, ...extra,
  });

  async function plan(name: string, maxTenants: number, views: string[], isActive = true) {
    const [p] = await db.insert(schema.adyPartnerPlans).values({ name: `${name} ${id}`, priceCents: 1000, maxTenants, isActive }).returning();
    if (views.length) await db.insert(schema.adyPartnerPlanViewsBlocked).values(views.map((viewKey) => ({ partnerPlanId: p!.id, viewKey })));
    planIds.push(p!.id);
    return p!.id;
  }

  async function createPartner(tag: string, extra: Record<string, unknown>) {
    const res = await request(app).post('/api/admin/partners').set(asSuper()).send(body(tag, extra));
    if (res.status === 201) {
      partnerIds.push(res.body.data.id);
      const [acc] = await db.select().from(schema.users).where(eq(schema.users.email, `pa-${tag}-${id}@test.com`));
      tenantIds.push(acc!.tenantId);
    }
    return res;
  }

  // telas bloqueadas no escopo do parceiro (clientes dele)
  async function blockedOf(partnerId: string) {
    const rows = await db.select({ key: schema.adyRbacViewsBlocked.viewKey }).from(schema.adyRbacViewsBlocked)
      .where(and(eq(schema.adyRbacViewsBlocked.partnerId, partnerId), eq(schema.adyRbacViewsBlocked.roleKey, 'user_partner')));
    return rows.map((r) => r.key).sort();
  }

  async function legacyPartner(tag: string, maxTenants: number) {
    const [p] = await db.insert(schema.adyPartners).values({ name: `PA legado ${tag} ${id}`, maxTenants }).returning();
    partnerIds.push(p!.id);
    return p!.id;
  }

  beforeAll(async () => {
    const email = `pa-super-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'Super', email, password, companyName: `PA ${id}` });
    const sup = (await login(email)).body.data;
    tenantIds.push(sup.user.tenantId);
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    await rbacService.bumpVersion();
    superToken = sup.token;
    ouro = await plan('Ouro', 5, ['calendar', 'studio']);
    pequeno = await plan('Pequeno', 1, []);
    inativo = await plan('Inativo', 3, [], false);
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(inArray(schema.tenants.partnerId, partnerIds));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await db.delete(schema.adyPartnerPlans).where(inArray(schema.adyPartnerPlans.id, planIds));
    await rbacService.bumpVersion();
  });

  it('criar parceiro sem plano = 400 com o motivo', async () => {
    const res = await createPartner('semplano', { maxTenants: 2 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/plano do parceiro/i);
  });

  it('plano inexistente = 404; plano inativo = 400', async () => {
    expect((await createPartner('x1', { partnerPlanId: '00000000-0000-0000-0000-000000000000' })).status).toBe(404);
    const res = await createPartner('x2', { partnerPlanId: inativo });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PARTNER_PLAN_INACTIVE');
    // nada criado pela metade
    expect(await db.select().from(schema.users).where(eq(schema.users.email, `pa-x2-${id}@test.com`))).toHaveLength(0);
  });

  it('parceiro nasce com as vagas e as telas do plano', async () => {
    const res = await createPartner('ouro', { partnerPlanId: ouro });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ maxTenants: 5, partnerPlanId: ouro, partnerPlanName: `Ouro ${id}`, partnerPlanPriceCents: 1000 });
    expect(await blockedOf(res.body.data.id)).toEqual(['calendar', 'studio']);

    // a aba Permissões lê o mesmo estado
    const perms = await request(app).get(`/api/admin/partners/${res.body.data.id}/permissions`).set(asSuper());
    const blocked = (perms.body.data as { key: string; blocked: boolean }[]).filter((v) => v.blocked).map((v) => v.key).sort();
    expect(blocked).toEqual(['calendar', 'studio']);

    const plans = await request(app).get('/api/admin/partner-plans').set(asSuper());
    expect((plans.body.data as { id: string; partnersCount: number }[]).find((p) => p.id === ouro)?.partnersCount).toBe(1);
  });

  it('vagas enviadas na criação valem como ajuste individual', async () => {
    const res = await createPartner('ajuste', { partnerPlanId: ouro, maxTenants: 9 });
    expect(res.status).toBe(201);
    expect(res.body.data.maxTenants).toBe(9);
  });

  it('parceiro antigo recebe plano: copia vagas e troca as telas pelas do plano', async () => {
    const pid = await legacyPartner('a', 2);
    await db.insert(schema.adyRbacViewsBlocked).values({ roleKey: 'user_partner', partnerId: pid, viewKey: 'goals' });
    const res = await request(app).put(`/api/admin/partners/${pid}/plan`).set(asSuper()).send({ partnerPlanId: ouro });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ partnerPlanId: ouro, maxTenants: 5 });
    expect(await blockedOf(pid)).toEqual(['calendar', 'studio']);

    const [audit] = await db.select().from(schema.adyRbacAuditLog)
      .where(and(eq(schema.adyRbacAuditLog.partnerId, pid), eq(schema.adyRbacAuditLog.action, 'partner_plan_assigned')));
    expect(audit?.details).toMatchObject({ partnerPlanId: ouro, on: 'assign' });
  });

  it('quem já tem plano não troca: 409', async () => {
    const pid = partnerIds[0]!;
    const res = await request(app).put(`/api/admin/partners/${pid}/plan`).set(asSuper()).send({ partnerPlanId: pequeno });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARTNER_ALREADY_HAS_PLAN');
  });

  it('plano com menos vagas que os clientes atuais: 409 e nada muda', async () => {
    const pid = await legacyPartner('b', 3);
    await db.insert(schema.tenants).values([
      { name: `PA cli1 ${id}`, slug: `pa-cli1-${id}`, partnerId: pid },
      { name: `PA cli2 ${id}`, slug: `pa-cli2-${id}`, partnerId: pid },
    ]);
    const res = await request(app).put(`/api/admin/partners/${pid}/plan`).set(asSuper()).send({ partnerPlanId: pequeno });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LIMIT_BELOW_USAGE');
    const [row] = await db.select().from(schema.adyPartners).where(eq(schema.adyPartners.id, pid));
    expect(row).toMatchObject({ partnerPlanId: null, maxTenants: 3 });
  });

  it('plano inválido no vínculo = 400/404', async () => {
    const pid = await legacyPartner('c', 1);
    expect((await request(app).put(`/api/admin/partners/${pid}/plan`).set(asSuper()).send({})).status).toBe(400);
    expect((await request(app).put(`/api/admin/partners/${pid}/plan`).set(asSuper()).send({ partnerPlanId: inativo })).status).toBe(400);
    expect((await request(app).put('/api/admin/partners/00000000-0000-0000-0000-000000000000/plan').set(asSuper()).send({ partnerPlanId: ouro })).status).toBe(404);
  });

  it('parceiro (admin_partner) não vincula plano: 403; sem login 401', async () => {
    const token = (await login(`pa-ouro-${id}@test.com`)).body.data.token;
    const pid = await legacyPartner('d', 1);
    expect((await request(app).put(`/api/admin/partners/${pid}/plan`).set({ Authorization: `Bearer ${token}` }).send({ partnerPlanId: ouro })).status).toBe(403);
    expect((await request(app).put(`/api/admin/partners/${pid}/plan`).send({ partnerPlanId: ouro })).status).toBe(401);
  });
});
