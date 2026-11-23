import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';
import { planSkipsTenant } from '../lib/plan-skip.js';

/**
 * INTEGRAÇÃO — telas bloqueadas do parceiro valem para a conta dele e para os clientes dele.
 */
describe('Bloqueio de telas vale para a conta do parceiro — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  const planIds: string[] = [];
  let superToken: string;
  let ouroToken: string;
  let livreToken: string;
  let ouroId: string;
  let ouroTenant: string;
  let livreTenant: string;

  const asSuper = () => ({ Authorization: `Bearer ${superToken}` });
  const login = (email: string) => request(app).post('/api/auth/login').send({ email, password });
  const blockedViews = async (token: string) =>
    (await request(app).get('/api/rbac/blocked-views').set({ Authorization: `Bearer ${token}` })).body.data.blocked as string[];

  async function partnerWithPlan(tag: string, views: string[]) {
    const [plan] = await db.insert(schema.adyPartnerPlans).values({ name: `POV ${tag} ${id}`, priceCents: 1000, maxTenants: 2 }).returning();
    planIds.push(plan!.id);
    if (views.length) await db.insert(schema.adyPartnerPlanViewsBlocked).values(views.map((viewKey) => ({ partnerPlanId: plan!.id, viewKey })));
    const res = await request(app).post('/api/admin/partners').set(asSuper()).send({
      name: `POV ${tag} ${id}`, partnerPlanId: plan!.id, accountName: 'Dona', accountEmail: `pov-${tag}-${id}@test.com`, accountPassword: password,
    });
    partnerIds.push(res.body.data.id);
    const [acc] = await db.select().from(schema.users).where(eq(schema.users.email, `pov-${tag}-${id}@test.com`));
    tenantIds.push(acc!.tenantId);
    return { partnerId: res.body.data.id as string, tenantId: acc!.tenantId, token: (await login(`pov-${tag}-${id}@test.com`)).body.data.token as string };
  }

  beforeAll(async () => {
    const email = `pov-super-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'Super', email, password, companyName: `POV ${id}` });
    const sup = (await login(email)).body.data;
    tenantIds.push(sup.user.tenantId);
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    await rbacService.bumpVersion();
    superToken = sup.token;

    const ouro = await partnerWithPlan('ouro', ['calendar']);
    ouroId = ouro.partnerId;
    ouroToken = ouro.token;
    ouroTenant = ouro.tenantId;
    const livre = await partnerWithPlan('livre', []);
    livreToken = livre.token;
    livreTenant = livre.tenantId;
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await db.delete(schema.adyPartnerPlans).where(inArray(schema.adyPartnerPlans.id, planIds));
    await rbacService.bumpVersion();
  });

  it('tela fora do plano some para o próprio parceiro (menu e API)', async () => {
    expect(await blockedViews(ouroToken)).toContain('calendar');
    const res = await request(app).get('/api/planner/calendar').set({ Authorization: `Bearer ${ouroToken}` });
    expect(res.status).toBe(403);
  });

  it('parceiro com tudo liberado não é bloqueado', async () => {
    expect(await blockedViews(livreToken)).not.toContain('calendar');
    const res = await request(app).get('/api/planner/calendar').set({ Authorization: `Bearer ${livreToken}` });
    expect(res.status).not.toBe(403);
  });

  it('o painel admin do parceiro continua liberado', async () => {
    expect((await request(app).get('/api/admin/dashboard').set({ Authorization: `Bearer ${ouroToken}` })).status).toBe(200);
    expect((await request(app).get('/api/admin/tenants').set({ Authorization: `Bearer ${ouroToken}` })).status).toBe(200);
  });

  it('liberar na aba Permissões vale na hora para o parceiro', async () => {
    const res = await request(app).put(`/api/admin/partners/${ouroId}/permissions`).set(asSuper()).send({ viewKey: 'calendar', blocked: false });
    expect(res.status).toBe(200);
    expect(await blockedViews(ouroToken)).not.toContain('calendar');
    // bloquear de novo também vale na hora
    await request(app).put(`/api/admin/partners/${ouroId}/permissions`).set(asSuper()).send({ viewKey: 'calendar', blocked: true });
    expect(await blockedViews(ouroToken)).toContain('calendar');
  });

  it('bloqueio de um parceiro não afeta o outro', async () => {
    await request(app).put(`/api/admin/partners/${ouroId}/permissions`).set(asSuper()).send({ viewKey: 'goals', blocked: true });
    expect(await blockedViews(ouroToken)).toContain('goals');
    expect(await blockedViews(livreToken)).not.toContain('goals');
  });

  it('super_admin nunca é bloqueado', async () => {
    expect(await blockedViews(superToken)).toEqual([]);
  });

  it('rotinas automáticas pulam o que o parceiro não tem (conta dele e clientes dele)', async () => {
    const [client] = await db.insert(schema.tenants).values({ name: `POV cli ${id}`, slug: `pov-cli-${id}`, partnerId: ouroId }).returning();
    tenantIds.push(client!.id);
    await rbacService.bumpVersion();
    expect(await planSkipsTenant(ouroTenant, ['calendar'], 'teste')).toBe(true);
    expect(await planSkipsTenant(client!.id, ['calendar'], 'teste')).toBe(true);
    // pula só se TODAS as funcionalidades estiverem fora
    expect(await planSkipsTenant(client!.id, ['planner', 'calendar'], 'teste')).toBe(false);
    expect(await planSkipsTenant(livreTenant, ['calendar'], 'teste')).toBe(false);
  });

  it('parceiro excluído: rotinas da conta e dos clientes dele não rodam (na dúvida, não executa)', async () => {
    await db.update(schema.adyPartners).set({ deletedAt: new Date() }).where(eq(schema.adyPartners.id, ouroId));
    await rbacService.bumpVersion();
    try {
      expect(await planSkipsTenant(ouroTenant, ['studio'], 'teste')).toBe(true);
    } finally {
      await db.update(schema.adyPartners).set({ deletedAt: null }).where(eq(schema.adyPartners.id, ouroId));
      await rbacService.bumpVersion();
    }
    // parceiro de volta: o que ele tem volta a rodar
    expect(await planSkipsTenant(ouroTenant, ['studio'], 'teste')).toBe(false);
  });

  it('desligar uma tela faz a rotina pular; religar faz voltar (cada rotina)', async () => {
    const [client] = await db.insert(schema.tenants).values({ name: `POV rotina ${id}`, slug: `pov-rotina-${id}`, partnerId: ouroId }).returning();
    tenantIds.push(client!.id);
    const perm = (viewKey: string, blocked: boolean) =>
      request(app).put(`/api/admin/partners/${ouroId}/permissions`).set(asSuper()).send({ viewKey, blocked });
    // rotina → telas que ela precisa (mesmas chaves usadas nos workers)
    const routines: { name: string; keys: string[]; toggle: string }[] = [
      { name: 'otimização de campanhas (fury-engine)', keys: ['campaigns'], toggle: 'campaigns' },
      { name: 'regras de campanha (rule-engine)', keys: ['campaigns'], toggle: 'campaigns' },
      { name: 'status dos leads (lead-status)', keys: ['leads'], toggle: 'campaigns' },
      { name: 'status dos leads (lead-status)', keys: ['leads'], toggle: 'leads' },
      { name: 'planejador (planner)', keys: ['planner'], toggle: 'planner' },
      // publicação agendada só para sem Planejador E sem Calendário (Calendário já está fora do plano)
      { name: 'publicação agendada (publish-due)', keys: ['planner', 'calendar'], toggle: 'planner' },
    ];
    for (const r of routines) {
      expect((await perm(r.toggle, false)).status).toBe(200);
      expect(await planSkipsTenant(client!.id, r.keys, 'teste'), `${r.name} ligado`).toBe(false);
      expect((await perm(r.toggle, true)).status).toBe(200);
      expect(await planSkipsTenant(client!.id, r.keys, 'teste'), `${r.name} desligado (${r.toggle})`).toBe(true);
      expect((await perm(r.toggle, false)).status).toBe(200);
      expect(await planSkipsTenant(client!.id, r.keys, 'teste'), `${r.name} religado`).toBe(false);
    }
  });
});
