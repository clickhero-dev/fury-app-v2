import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';
import { RBAC_VIEWS } from '../lib/rbac-views.js';
import { planSkipsTenant } from '../lib/plan-skip.js';

/**
 * INTEGRAÇÃO (app real + banco de teste + Redis local) — plano define as funcionalidades do cliente.
 */
describe('Funcionalidades por plano — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const planIds: string[] = [];
  let partnerId: string;
  let superToken: string;
  let partnerToken: string;
  let client: { token: string; user: { id: string; tenantId: string } };
  let adminToken: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function register(tag: string) {
    const email = `pv-${tag}-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'PV', email, password, companyName: `PV ${tag} ${id}` });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data as { token: string; user: { id: string; tenantId: string } };
  }

  async function createPlan(token: string, blockedViews: string[]) {
    const res = await request(app).post('/api/admin/plans').set(auth(token))
      .send({ name: `PV ${id} ${planIds.length}`, priceCents: 1000, interval: 'monthly', blockedViews });
    if (res.status === 201) planIds.push(res.body.data.id);
    return res;
  }

  const assign = (tenantId: string, planId: string) =>
    request(app).patch(`/api/admin/tenants/${tenantId}/subscription`).set(auth(superToken)).send({ planId, status: 'active' });

  beforeAll(async () => {
    for (const v of RBAC_VIEWS) await db.insert(schema.adyRbacViews).values({ key: v.key, description: v.description }).onConflictDoNothing();
    const [p] = await db.insert(schema.adyPartners).values({ name: `PV parceiro ${id}`, maxTenants: 5 }).returning();
    partnerId = p!.id;

    const sup = await register('super');
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    superToken = sup.token;

    const partner = await register('partner');
    await db.update(schema.users).set({ platformRole: 'admin_partner', partnerId }).where(eq(schema.users.id, partner.user.id));
    partnerToken = partner.token;
    // parceiro já não tem o calendário
    await db.insert(schema.adyRbacViewsBlocked).values({ roleKey: 'user_partner', partnerId, viewKey: 'calendar' });

    client = await register('client');
    const adm = await register('admin');
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, adm.user.id));
    adminToken = adm.token;
    await rbacService.bumpVersion();
  });

  afterAll(async () => {
    await db.delete(schema.subscriptions).where(inArray(schema.subscriptions.tenantId, tenantIds));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    if (planIds.length) await db.delete(schema.plans).where(inArray(schema.plans.id, planIds));
    await db.delete(schema.adyPartners).where(eq(schema.adyPartners.id, partnerId));
    await rbacService.bumpVersion();
  });

  it('super_admin grava e lê as funcionalidades do plano', async () => {
    const res = await createPlan(superToken, ['leads', 'studio', 'studio.image']);
    expect(res.status).toBe(201);
    const list = await request(app).get('/api/admin/plans').set(auth(superToken));
    const plan = list.body.data.find((p: { id: string }) => p.id === res.body.data.id);
    // filho de pai já bloqueado não é gravado
    expect(plan.blockedViews.sort()).toEqual(['leads', 'studio']);
  });

  it.each(['dashboard', 'settings', 'admin.users', 'goals', 'xyz'])('%s não é bloqueável → 400', async (key) => {
    const res = await createPlan(superToken, [key]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PLAN_VIEW');
  });

  it('cliente do plano perde a funcionalidade; trocar de plano devolve na hora', async () => {
    const blocking = (await createPlan(superToken, ['leads'])).body.data.id;
    const open = (await createPlan(superToken, [])).body.data.id;

    expect((await assign(client.user.tenantId, blocking)).status).toBe(200);
    const views = await request(app).get('/api/rbac/blocked-views').set(auth(client.token));
    expect(views.body.data.blocked).toContain('leads');
    const leads = await request(app).get('/api/v2/leads').set(auth(client.token));
    expect(leads.status).toBe(403);
    expect(leads.body.error.code).toBe('SERVICE_BLOCKED');
    expect(await planSkipsTenant(client.user.tenantId, ['leads'], 'test')).toBe(true);

    expect((await assign(client.user.tenantId, open)).status).toBe(200);
    expect((await request(app).get('/api/rbac/blocked-views').set(auth(client.token))).body.data.blocked).not.toContain('leads');
    expect((await request(app).get('/api/v2/leads').set(auth(client.token))).status).not.toBe(403);
    expect(await planSkipsTenant(client.user.tenantId, ['leads'], 'test')).toBe(false);
  });

  it('editar o plano vale para quem já assina', async () => {
    const plan = (await createPlan(superToken, [])).body.data.id;
    await assign(client.user.tenantId, plan);
    expect((await request(app).get('/api/v2/campaigns').set(auth(client.token))).status).not.toBe(403);

    expect((await request(app).patch(`/api/admin/plans/${plan}`).set(auth(superToken)).send({ blockedViews: ['campaigns'] })).status).toBe(200);
    // campanhas leva junto criar campanha e leads
    const views = (await request(app).get('/api/rbac/blocked-views').set(auth(client.token))).body.data.blocked;
    expect(views).toEqual(expect.arrayContaining(['campaigns', 'campaigns.create', 'leads']));
    expect((await request(app).get('/api/v2/campaigns').set(auth(client.token))).status).toBe(403);
    // buscas da Meta seguem liberadas (Configurações › Público)
    expect((await request(app).get('/api/campaigns/meta-interests?q=a').set(auth(client.token))).status).not.toBe(403);
  });

  it('administrador do cliente não segue o plano', async () => {
    const plan = (await createPlan(superToken, ['leads'])).body.data.id;
    const [adm] = await db.select().from(schema.users).where(eq(schema.users.email, `pv-admin-${id}@test.com`));
    await assign(adm!.tenantId, plan);
    expect((await request(app).get('/api/rbac/blocked-views').set(auth(adminToken))).body.data.blocked).not.toContain('leads');
    expect((await request(app).get('/api/v2/leads').set(auth(adminToken))).status).not.toBe(403);
  });

  it('parceiro só mexe no que ele tem', async () => {
    const views = (await request(app).get('/api/admin/plans/configurable-views').set(auth(partnerToken))).body.data.views;
    expect(views.find((v: { key: string }) => v.key === 'calendar').locked).toBe(true);
    // telas ocultas não entram no plano
    expect(views.some((v: { key: string }) => v.key === 'planner' || v.key === 'automation')).toBe(false);
    expect(views.find((v: { key: string }) => v.key === 'studio').locked).toBe(false);
    expect(views.find((v: { key: string }) => v.key === 'studio.image').parent).toBe('studio');

    const ok = await createPlan(partnerToken, ['studio']);
    expect(ok.status).toBe(201);
    const locked = await createPlan(partnerToken, ['calendar']);
    expect(locked.status).toBe(400);
    expect(locked.body.error.code).toBe('INVALID_PLAN_VIEW');

    const superViews = (await request(app).get('/api/admin/plans/configurable-views').set(auth(superToken))).body.data.views;
    expect(superViews.every((v: { locked: boolean }) => !v.locked)).toBe(true);
  });

  it('marcação antiga fora da lista não trava a edição e some no save', async () => {
    const plan = (await createPlan(superToken, [])).body.data.id;
    await db.insert(schema.adyRbacPlanViewsBlocked).values({ planId: plan, viewKey: 'automation' });
    const res = await request(app).patch(`/api/admin/plans/${plan}`).set(auth(superToken)).send({ blockedViews: ['leads'] });
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.adyRbacPlanViewsBlocked).where(eq(schema.adyRbacPlanViewsBlocked.planId, plan));
    expect(rows.map((r) => r.viewKey)).toEqual(['leads']);
  });

  it('excluir o plano limpa as funcionalidades gravadas', async () => {
    const plan = (await createPlan(superToken, ['studio'])).body.data.id;
    expect((await request(app).delete(`/api/admin/plans/${plan}`).set(auth(superToken))).status).toBe(200);
    const rows = await db.select().from(schema.adyRbacPlanViewsBlocked).where(eq(schema.adyRbacPlanViewsBlocked.planId, plan));
    expect(rows).toEqual([]);
  });
});
