import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { RbacRepository } from '../repository/rbac.repository.js';
import { rbacService } from '../services/core/rbac.service.js';
import { RBAC_VIEWS } from '../lib/rbac-views.js';

/**
 * INTEGRAÇÃO (app real + banco de teste + Redis local) — RBAC de serviços.
 * Bloqueios gravados em ady_rbac_services_blocked; cache invalidado via bumpVersion.
 */
describe('RBAC de serviços — integração', () => {
  const id = Date.now().toString().slice(-8);
  let token: string;
  let userId: string;
  let tenantId: string;
  let partnerA: string;
  let partnerB: string;
  const repo = new RbacRepository();

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const get = (path: string) => request(app).get(path).set(auth());

  async function setUser(platformRole: string, opts: { userPartner?: string | null; tenantPartner?: string | null } = {}) {
    await db.update(schema.users).set({ platformRole, partnerId: opts.userPartner ?? null }).where(eq(schema.users.id, userId));
    await db.update(schema.tenants).set({ partnerId: opts.tenantPartner ?? null }).where(eq(schema.tenants.id, tenantId));
    await rbacService.bumpVersion();
  }

  async function block(roleKey: string, serviceKey: string, partnerId: string | null = null) {
    await db.insert(schema.adyRbacServicesBlocked).values({ roleKey, serviceKey, partnerId });
    await rbacService.bumpVersion();
  }

  async function blockView(roleKey: string, viewKey: string, partnerId: string | null = null) {
    await db.insert(schema.adyRbacViewsBlocked).values({ roleKey, viewKey, partnerId });
    await rbacService.bumpVersion();
  }

  beforeAll(async () => {
    for (const key of ['goals', 'brand_kit', 'studio', 'studio.video']) {
      await db.insert(schema.adyRbacServices).values({ key }).onConflictDoNothing();
    }
    for (const v of RBAC_VIEWS) {
      await db.insert(schema.adyRbacViews).values({ key: v.key }).onConflictDoNothing();
    }
    await request(app).post('/api/auth/register').send({
      name: 'RBAC User',
      email: `rbac-int-${id}@test.com`,
      password: 'SecurePass123!',
      companyName: `RBAC Company ${id}`,
    });
    const login = await request(app).post('/api/auth/login').send({
      email: `rbac-int-${id}@test.com`,
      password: 'SecurePass123!',
    });
    token = login.body.data.token;
    userId = login.body.data.user.id;
    tenantId = login.body.data.user.tenantId;

    const [plan] = await db
      .insert(schema.plans)
      .values({ name: `RBAC Plan ${id}`, priceCents: 100, interval: 'monthly', isActive: true })
      .returning();
    await db.insert(schema.subscriptions).values({ tenantId, planId: plan!.id, status: 'active', isNonExpirable: true });

    const [a] = await db.insert(schema.adyPartners).values({ name: `Parceiro A ${id}`, maxTenants: 10 }).returning();
    const [b] = await db.insert(schema.adyPartners).values({ name: `Parceiro B ${id}`, maxTenants: 10 }).returning();
    partnerA = a!.id;
    partnerB = b!.id;
  });

  afterEach(async () => {
    await db.delete(schema.adyRbacViewsBlocked).where(inArray(schema.adyRbacViewsBlocked.roleKey, ['user', 'user_partner', 'admin_partner', 'super_admin', 'tester']));
    await db.delete(schema.adyRbacServicesBlocked).where(inArray(schema.adyRbacServicesBlocked.roleKey, ['user', 'user_partner', 'admin_partner', 'super_admin', 'tester']));
    await setUser('user');
  });

  afterAll(async () => {
    await db.update(schema.tenants).set({ partnerId: null }).where(eq(schema.tenants.id, tenantId));
    await db.update(schema.users).set({ partnerId: null }).where(eq(schema.users.id, userId));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, [partnerA, partnerB]));
  });

  it('sem bloqueio → acessa normalmente', async () => {
    expect((await get('/api/goals')).status).not.toBe(403);
  });

  it('bloqueio global do papel → 403 só no módulo bloqueado', async () => {
    await block('user', 'goals');
    const res = await get('/api/goals');
    expect(res.status).toBe(403);
    expect(res.body.error?.code ?? res.body.code).toBe('SERVICE_BLOCKED');
    expect((await get('/api/brand-kit')).status).not.toBe(403);
  });

  it('variações do caminho também são bloqueadas no app real', async () => {
    await block('user', 'goals');
    for (const p of ['/api/GOALS', '/api/Goals/', '/api/goals/progress', '/api//goals', '/api/%67oals']) {
      expect((await get(p)).status, p).toBe(403);
    }
  });

  it('bloqueio de outro papel não afeta', async () => {
    await block('user_partner', 'goals');
    expect((await get('/api/goals')).status).not.toBe(403);
  });

  it('cliente de parceiro: bloqueio do próprio parceiro vale, do outro não', async () => {
    await setUser('user_partner', { tenantPartner: partnerA });
    await block('user_partner', 'goals', partnerB);
    expect((await get('/api/goals')).status).not.toBe(403);
    await block('user_partner', 'goals', partnerA);
    expect((await get('/api/goals')).status).toBe(403);
  });

  it('cliente de parceiro: bloqueio global do papel vale para todos os parceiros', async () => {
    await setUser('user_partner', { tenantPartner: partnerA });
    await block('user_partner', 'goals');
    expect((await get('/api/goals')).status).toBe(403);
  });

  it('admin_partner: parceiro vem de users.partner_id', async () => {
    await setUser('admin_partner', { userPartner: partnerA });
    await block('admin_partner', 'brand_kit', partnerA);
    expect((await get('/api/brand-kit')).status).toBe(403);
    expect((await get('/api/goals')).status).not.toBe(403);
  });

  it("'all' bloqueia tudo, menos os isentos", async () => {
    await block('user', 'all');
    expect((await get('/api/goals')).status).toBe(403);
    expect((await get('/api/brand-kit')).status).toBe(403);
    expect((await get('/api/billing/subscription')).status).not.toBe(403);
    expect((await get('/api/auth/me')).status).not.toBe(403);
  });

  it('bloqueio hierárquico: studio bloqueia studio.video', async () => {
    await block('user', 'studio');
    expect((await get('/api/studio/video/qualquer')).status).toBe(403);
  });

  it('super_admin nunca é bloqueado', async () => {
    await setUser('super_admin');
    await block('super_admin', 'all');
    expect((await get('/api/goals')).status).not.toBe(403);
  });

  it('remover o bloqueio + bumpVersion libera na hora', async () => {
    await block('user', 'goals');
    expect((await get('/api/goals')).status).toBe(403);
    await db.delete(schema.adyRbacServicesBlocked).where(eq(schema.adyRbacServicesBlocked.roleKey, 'user'));
    await rbacService.bumpVersion();
    expect((await get('/api/goals')).status).not.toBe(403);
  });

  it('sem token: o RBAC não interfere, a auth da rota responde 401', async () => {
    await block('user', 'all');
    expect((await request(app).get('/api/goals')).status).toBe(401);
  });

  describe('GET /api/rbac/blocked-views', () => {
    const views = () => get('/api/rbac/blocked-views');

    it('sem bloqueio → lista vazia, sem cache HTTP', async () => {
      const res = await views();
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, data: { blocked: [] } });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('admin_partner: global do papel + do próprio parceiro, nunca do outro', async () => {
      await setUser('admin_partner', { userPartner: partnerA });
      await blockView('admin_partner', 'admin.tickets');
      await blockView('admin_partner', 'admin.users', partnerA);
      await blockView('admin_partner', 'admin.faqs', partnerB);
      await blockView('user_partner', 'admin.plans');
      expect((await views()).body.data.blocked).toEqual(['admin.users', 'admin.tickets']);
    });

    it('cliente do parceiro: pai bloqueado expande para os filhos', async () => {
      await setUser('user_partner', { tenantPartner: partnerA });
      await blockView('user_partner', 'campaigns', partnerA);
      expect((await views()).body.data.blocked).toEqual(['campaigns', 'campaigns.create', 'campaigns.rules']);
    });

    it("'all' → todas as telas", async () => {
      await setUser('user_partner', { tenantPartner: partnerA });
      await blockView('user_partner', 'all');
      expect((await views()).body.data.blocked).toEqual(RBAC_VIEWS.map((v) => v.key));
    });

    it('super_admin → nada bloqueado', async () => {
      await setUser('super_admin');
      await blockView('super_admin', 'all');
      expect((await views()).body.data.blocked).toEqual([]);
    });

    it('remover bloqueio + bumpVersion reflete na hora', async () => {
      await blockView('user', 'plans');
      expect((await views()).body.data.blocked).toEqual(['plans']);
      await db.delete(schema.adyRbacViewsBlocked).where(eq(schema.adyRbacViewsBlocked.roleKey, 'user'));
      await rbacService.bumpVersion();
      expect((await views()).body.data.blocked).toEqual([]);
    });

    it("serviços 'all' bloqueados não bloqueiam esta rota (isenta)", async () => {
      await block('user', 'all');
      expect((await views()).status).toBe(200);
    });

    it('sem token → 401', async () => {
      expect((await request(app).get('/api/rbac/blocked-views')).status).toBe(401);
    });
  });

  describe('RbacRepository (SQL real)', () => {
    it('findUserContext: partner do tenant e do usuário', async () => {
      await setUser('user_partner', { tenantPartner: partnerA });
      expect(await repo.findUserContext(userId)).toEqual({ platformRole: 'user_partner', partnerId: partnerA });
      await setUser('admin_partner', { userPartner: partnerB });
      expect(await repo.findUserContext(userId)).toEqual({ platformRole: 'admin_partner', partnerId: partnerB });
      expect(await repo.findUserContext('00000000-0000-0000-0000-000000000000')).toBeNull();
    });

    it('listBlockedServiceKeys: global + do parceiro, nunca de outro parceiro', async () => {
      await block('user_partner', 'goals');
      await block('user_partner', 'brand_kit', partnerA);
      await block('user_partner', 'studio', partnerB);
      expect((await repo.listBlockedServiceKeys('user_partner', partnerA)).sort()).toEqual(['brand_kit', 'goals']);
      expect((await repo.listBlockedServiceKeys('user_partner', partnerB)).sort()).toEqual(['goals', 'studio']);
      expect(await repo.listBlockedServiceKeys('user_partner', null)).toEqual(['goals']);
      expect(await repo.listBlockedServiceKeys('user', partnerA)).toEqual([]);
    });
  });
});
