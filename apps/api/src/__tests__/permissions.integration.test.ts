import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';
import { RBAC_SERVICES } from '../lib/rbac-services.js';
import { RBAC_VIEWS } from '../lib/rbac-views.js';

/**
 * INTEGRAÇÃO (app real + banco de teste + Redis local) — tela de Permissões (super_admin).
 * Bloqueio por parceiro e padrão (todos): tela + serviço, vale na hora e grava histórico.
 */
describe('Permissões (super_admin) — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  let superToken: string;
  let superId: string;
  let partnerToken: string;
  let partnerA: string;
  let partnerB: string;
  let clientA: string;
  let clientB: string;
  let clientAdy: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const permsA = () => `/api/admin/partners/${partnerA}/permissions`;
  const DEFAULT = '/api/admin/permissions/default';

  async function register(tag: string) {
    const email = `pm-${tag}-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'PM', email, password, companyName: `PM ${tag} ${id}` });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data as { token: string; user: { id: string; tenantId: string } };
  }

  async function newPartner(name: string) {
    const [p] = await db.insert(schema.adyPartners).values({ name: `${name} ${id}`, maxTenants: 5 }).returning();
    partnerIds.push(p!.id);
    return p!.id;
  }

  // cliente com assinatura ativa, para o 403 vir só do RBAC
  async function client(tag: string, partnerId: string | null) {
    const c = await register(tag);
    await db.update(schema.tenants).set({ partnerId }).where(eq(schema.tenants.id, c.user.tenantId));
    if (partnerId) await db.update(schema.users).set({ platformRole: 'user_partner' }).where(eq(schema.users.id, c.user.id));
    const [plan] = await db.insert(schema.plans).values({ name: `PM ${tag} ${id}`, priceCents: 100, interval: 'monthly', isActive: true }).returning();
    await db.insert(schema.subscriptions).values({ tenantId: c.user.tenantId, planId: plan!.id, status: 'active', isNonExpirable: true });
    return c.token;
  }

  const blockedViews = async (token: string) => (await request(app).get('/api/rbac/blocked-views').set(bearer(token))).body.data.blocked as string[];
  const studioStatus = async (token: string) => (await request(app).get('/api/studio/posts').set(bearer(token))).status;
  const audit = () => db.select().from(schema.adyRbacAuditLog).where(eq(schema.adyRbacAuditLog.actorUserId, superId));

  beforeAll(async () => {
    for (const s of RBAC_SERVICES) await db.insert(schema.adyRbacServices).values({ key: s.key }).onConflictDoNothing();
    for (const v of RBAC_VIEWS) await db.insert(schema.adyRbacViews).values({ key: v.key }).onConflictDoNothing();

    partnerA = await newPartner('Parceiro A');
    partnerB = await newPartner('Parceiro B');

    const sup = await register('super');
    superId = sup.user.id;
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, superId));
    superToken = sup.token;

    const partner = await register('partner');
    await db.update(schema.users).set({ platformRole: 'admin_partner', partnerId: partnerA }).where(eq(schema.users.id, partner.user.id));
    partnerToken = partner.token;

    clientA = await client('cli-a', partnerA);
    clientB = await client('cli-b', partnerB);
    clientAdy = await client('cli-ady', null);
    await rbacService.bumpVersion();
  });

  afterAll(async () => {
    await db.delete(schema.adyRbacViewsBlocked).where(isNull(schema.adyRbacViewsBlocked.partnerId));
    await db.delete(schema.adyRbacServicesBlocked).where(isNull(schema.adyRbacServicesBlocked.partnerId));
    await db.delete(schema.adyRbacAuditLog).where(eq(schema.adyRbacAuditLog.actorUserId, superId));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await rbacService.bumpVersion();
  });

  it('parceiro não lê nem altera permissões (nem as dele)', async () => {
    const other = `/api/admin/partners/${partnerB}/permissions`;
    for (const path of [permsA(), other, DEFAULT]) {
      expect((await request(app).get(path).set(bearer(partnerToken))).status).toBe(403);
      expect((await request(app).put(path).set(bearer(partnerToken)).send({ viewKey: 'studio', blocked: true })).status).toBe(403);
    }
    expect((await request(app).get(permsA())).status).toBe(401);
  });

  it('parceiro inexistente → 404; tela inválida → 400', async () => {
    const sup = bearer(superToken);
    expect((await request(app).get('/api/admin/partners/nao-e-uuid/permissions').set(sup)).status).toBe(404);
    expect((await request(app).get('/api/admin/partners/00000000-0000-0000-0000-000000000000/permissions').set(sup)).status).toBe(404);
    for (const viewKey of ['all', 'admin.users', 'nao-existe']) {
      expect((await request(app).put(permsA()).set(sup).send({ viewKey, blocked: true })).status).toBe(400);
    }
    const list = (await request(app).get(permsA()).set(sup)).body.data as { key: string }[];
    expect(list.some((v) => v.key.startsWith('admin.'))).toBe(false);
  });

  it('bloquear no parceiro A: tela + serviço só para os clientes dele, na hora', async () => {
    expect(await studioStatus(clientA)).not.toBe(403);

    const res = await request(app).put(permsA()).set(bearer(superToken)).send({ viewKey: 'studio', blocked: true });
    expect(res.status).toBe(200);
    expect(res.body.data.find((v: { key: string }) => v.key === 'studio')).toMatchObject({ blocked: true, locked: false });
    expect(res.body.data.find((v: { key: string }) => v.key === 'studio.video')).toMatchObject({ blocked: false, locked: true });

    const [svc] = await db.select().from(schema.adyRbacServicesBlocked)
      .where(and(eq(schema.adyRbacServicesBlocked.partnerId, partnerA), eq(schema.adyRbacServicesBlocked.serviceKey, 'studio')));
    expect(svc).toMatchObject({ roleKey: 'user_partner', createdBy: superId });

    expect(await studioStatus(clientA)).toBe(403);
    expect(await blockedViews(clientA)).toEqual(expect.arrayContaining(['studio', 'studio.image', 'studio.video']));
    expect(await studioStatus(clientB)).not.toBe(403);
    expect(await blockedViews(clientB)).toEqual([]);
    expect(await blockedViews(superToken)).toEqual([]);

    // repetir não duplica nada
    await request(app).put(permsA()).set(bearer(superToken)).send({ viewKey: 'studio', blocked: true });
    const logs = (await audit()).filter((l) => l.partnerId === partnerA);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'view_blocked', entityKey: 'studio', roleKey: 'user_partner' });

    // desbloquear apaga tela e serviço
    await request(app).put(permsA()).set(bearer(superToken)).send({ viewKey: 'studio', blocked: false });
    expect(await studioStatus(clientA)).not.toBe(403);
    expect(await db.select().from(schema.adyRbacServicesBlocked).where(eq(schema.adyRbacServicesBlocked.partnerId, partnerA))).toEqual([]);
    expect((await audit()).filter((l) => l.partnerId === partnerA).map((l) => l.action)).toEqual(expect.arrayContaining(['view_unblocked']));
  });

  it('padrão: vale só para cliente da ady; parceiro e clientes dele seguem o plano', async () => {
    const res = await request(app).put(DEFAULT).set(bearer(superToken)).send({ viewKey: 'goals', blocked: true });
    expect(res.status).toBe(200);
    expect(await blockedViews(clientAdy)).toContain('goals');
    expect(await blockedViews(clientA)).not.toContain('goals');
    expect(await blockedViews(clientB)).not.toContain('goals');
    expect(await blockedViews(superToken)).toEqual([]);

    // aba do parceiro não fica travada pelo padrão
    const a = (await request(app).get(permsA()).set(bearer(superToken))).body.data;
    expect(a.find((v: { key: string }) => v.key === 'goals')).toMatchObject({ blocked: false, locked: false });

    // grava só para o cliente da ady
    const roles = (await db.select().from(schema.adyRbacViewsBlocked).where(isNull(schema.adyRbacViewsBlocked.partnerId))).map((r) => r.roleKey);
    expect(roles).toEqual(['user']);

    await request(app).put(DEFAULT).set(bearer(superToken)).send({ viewKey: 'goals', blocked: false });
    expect(await blockedViews(clientAdy)).toEqual([]);
  });

  it('telas essenciais e Automações não aparecem nem podem ser bloqueadas', async () => {
    const essentials = ['dashboard', 'settings', 'settings.integrations', 'plans', 'subscription', 'automation'];
    for (const url of [DEFAULT, permsA()]) {
      const keys = ((await request(app).get(url).set(bearer(superToken))).body.data as { key: string }[]).map((v) => v.key);
      for (const k of essentials) expect(keys, `${url} ${k}`).not.toContain(k);
    }
    for (const viewKey of essentials) {
      expect((await request(app).put(permsA()).set(bearer(superToken)).send({ viewKey, blocked: true })).status).toBe(400);
    }
    const catalog = ((await request(app).get('/api/admin/partner-plans/views').set(bearer(superToken))).body.data as { key: string }[]).map((v) => v.key);
    for (const k of essentials) expect(catalog).not.toContain(k);
  });

  it('Clientes fica sob Campanhas: travado na aba e fora do menu quando Campanhas desliga', async () => {
    await request(app).put(permsA()).set(bearer(superToken)).send({ viewKey: 'campaigns', blocked: true });
    try {
      const list = (await request(app).get(permsA()).set(bearer(superToken))).body.data as { key: string; locked: boolean; blocked: boolean }[];
      expect(list.find((v) => v.key === 'leads')).toMatchObject({ blocked: false, locked: true });
      expect(await blockedViews(clientA)).toEqual(expect.arrayContaining(['campaigns', 'leads']));
    } finally {
      await request(app).put(permsA()).set(bearer(superToken)).send({ viewKey: 'campaigns', blocked: false });
    }
    expect(await blockedViews(clientA)).not.toContain('leads');
  });

  it('plano de cliente do parceiro: oferece tudo o que o parceiro tem, ignorando os bloqueios gerais da ady', async () => {
    // telas que o parceiro pode oferecer (as travadas ficam de fora)
    const offer = async () =>
      ((await request(app).get('/api/admin/plans/configurable-views').set(bearer(partnerToken))).body.data.views as { key: string; locked: boolean }[])
        .filter((v) => !v.locked).map((v) => v.key);
    await request(app).put(DEFAULT).set(bearer(superToken)).send({ viewKey: 'calendar', blocked: true });
    try {
      expect(await offer()).toContain('calendar');
      await request(app).put(permsA()).set(bearer(superToken)).send({ viewKey: 'calendar', blocked: true });
      expect(await offer()).not.toContain('calendar');
    } finally {
      await request(app).put(permsA()).set(bearer(superToken)).send({ viewKey: 'calendar', blocked: false });
      await request(app).put(DEFAULT).set(bearer(superToken)).send({ viewKey: 'calendar', blocked: false });
    }
  });

  it('tela desativada (Orçamento smart) some da lista e não pode ser alterada', async () => {
    const list = (await request(app).get(DEFAULT).set(bearer(superToken))).body.data as { key: string }[];
    expect(list.map((v) => v.key)).not.toContain('budget');
    expect(list.map((v) => v.key)).toContain('goals');
    const res = await request(app).put(DEFAULT).set(bearer(superToken)).send({ viewKey: 'budget', blocked: false });
    expect(res.status).toBe(400);
  });

  it('todo serviço ligado a uma tela existe no catálogo', () => {
    const keys = new Set(RBAC_SERVICES.map((s) => s.key));
    expect(RBAC_VIEWS.flatMap((v) => v.services ?? []).filter((k) => !keys.has(k))).toEqual([]);
  });
});
