import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';

/**
 * INTEGRAÇÃO (app real + banco de teste + Redis local) — clientes do parceiro.
 * Vagas do próprio parceiro e "Novo Cliente" que nunca passa do limite.
 */
describe('Clientes do parceiro — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  let superToken: string;
  let tokenA: string;
  let tokenB: string;
  let partnerA: string;
  let partnerB: string;
  let n = 0;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const client = (overrides: Record<string, unknown> = {}) => ({
    name: `Cliente ${id}`,
    userName: 'Dono',
    userEmail: `pc-c${++n}-${id}@test.com`,
    userPassword: password,
    ...overrides,
  });
  const create = (token: string, body = client()) => request(app).post('/api/admin/my-partner/clients').set(bearer(token)).send(body);
  const track = (res: request.Response) => {
    if (res.body?.data?.tenant?.id) tenantIds.push(res.body.data.tenant.id);
    return res;
  };

  async function register(tag: string) {
    const email = `pc-${tag}-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'PC', email, password, companyName: `PC ${tag} ${id}` });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data as { token: string; user: { id: string; tenantId: string } };
  }

  async function partnerAccount(tag: string, maxTenants: number) {
    const [p] = await db.insert(schema.adyPartners).values({ name: `PC ${tag} ${id}`, maxTenants }).returning();
    partnerIds.push(p!.id);
    const acc = await register(tag);
    await db.update(schema.users).set({ platformRole: 'admin_partner', partnerId: p!.id }).where(eq(schema.users.id, acc.user.id));
    return { partnerId: p!.id, token: acc.token };
  }

  beforeAll(async () => {
    const sup = await register('super');
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    superToken = sup.token;
    ({ partnerId: partnerA, token: tokenA } = await partnerAccount('a', 2));
    ({ partnerId: partnerB, token: tokenB } = await partnerAccount('b', 5));
    await rbacService.bumpVersion();
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.plans).where(inArray(schema.plans.partnerId, partnerIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await rbacService.bumpVersion();
  });

  it('vagas: só as do próprio parceiro, sem chave nem e-mail', async () => {
    const res = await request(app).get('/api/admin/my-partner').set(bearer(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: partnerA, name: `PC a ${id}`, maxTenants: 2, usedTenants: 0 });

    expect((await request(app).get('/api/admin/my-partner').set(bearer(superToken))).status).toBe(404);
    expect((await request(app).get('/api/admin/my-partner')).status).toBe(401);
    const user = await register('comum');
    expect((await request(app).get('/api/admin/my-partner').set(bearer(user.token))).status).toBe(403);
    expect((await create(user.token)).status).toBe(403);
  });

  it('cria cliente do parceiro; body não escolhe parceiro, cargo nem papel', async () => {
    const res = track(await create(tokenA, client({ partnerId: partnerB, userRole: 'admin', role: 'admin', platformRole: 'super_admin', slug: 'x' })));
    expect(res.status).toBe(201);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, res.body.data.tenant.id));
    expect(tenant?.partnerId).toBe(partnerA);
    const [owner] = await db.select().from(schema.users).where(eq(schema.users.id, res.body.data.user.id));
    expect(owner).toMatchObject({ role: 'owner', platformRole: 'user_partner' });

    // dono entra; sem plano do parceiro, nasce sem assinatura
    const login = await request(app).post('/api/auth/login').send({ email: owner!.email, password });
    expect(login.status).toBe(200);
    expect(await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.tenantId, tenant!.id))).toEqual([]);

    // B não enxerga; super sim
    expect((await request(app).get(`/api/admin/tenants/${tenant!.id}`).set(bearer(tokenB))).status).toBe(404);
    const all = await request(app).get('/api/admin/tenants').set(bearer(superToken));
    expect(all.body.data.map((t: { id: string }) => t.id)).toContain(tenant!.id);
    expect((await request(app).get('/api/admin/my-partner').set(bearer(tokenA))).body.data.usedTenants).toBe(1);
  });

  it('com plano escolhido, cliente nasce com assinatura ativa; plano desativado não vale', async () => {
    const [plan] = await db.insert(schema.plans)
      .values({ name: `PC Básico ${id}`, priceCents: 100, interval: 'monthly', partnerId: partnerB, limits: { creativesPerMonth: 8 } })
      .returning();
    const [off] = await db.insert(schema.plans)
      .values({ name: `PC Off ${id}`, priceCents: 100, interval: 'monthly', isActive: false, partnerId: partnerB })
      .returning();
    expect((await create(tokenB, client({ planId: off!.id }))).status).toBe(404);
    const res = track(await create(tokenB, client({ planId: plan!.id })));
    expect(res.status).toBe(201);
    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.tenantId, res.body.data.tenant.id));
    expect(sub).toMatchObject({ planId: plan!.id, status: 'active', creativesRemaining: 8 });
  });

  it('limite: nunca passa, nem com cliques simultâneos; excluir libera vaga', async () => {
    // A tem 1 de 2: três pedidos juntos → só 1 entra
    const all = (await Promise.all([create(tokenA), create(tokenA), create(tokenA)])).map(track);
    expect(all.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(all.find((r) => r.status === 409)!.body.error.code).toBe('PARTNER_LIMIT');
    expect((await request(app).get('/api/admin/my-partner').set(bearer(tokenA))).body.data.usedTenants).toBe(2);

    const created = all.find((r) => r.status === 201)!.body.data.tenant.id;
    expect((await request(app).delete(`/api/admin/tenants/${created}`).set(bearer(tokenA))).status).toBe(200);
    expect(track(await create(tokenA)).status).toBe(201);

    await db.update(schema.adyPartners).set({ maxTenants: 0 }).where(eq(schema.adyPartners.id, partnerB));
    expect((await create(tokenB)).status).toBe(409);
    await db.update(schema.adyPartners).set({ maxTenants: 5 }).where(eq(schema.adyPartners.id, partnerB));
  });

  it('e-mail repetido → 409 (inclui excluído); nome repetido ganha slug novo', async () => {
    const dup = await create(tokenB, client({ userEmail: `pc-a-${id}@test.com` }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_EXISTS');
    // dono do cliente excluído no teste de limite continua com o e-mail preso
    const [gone] = await db.select().from(schema.users).where(inArray(schema.users.tenantId, tenantIds));
    await db.update(schema.users).set({ deletedAt: new Date() }).where(eq(schema.users.id, gone!.id));
    expect((await create(tokenB, client({ userEmail: gone!.email }))).status).toBe(409);

    const same = track(await create(tokenB, client({ name: `Cliente ${id}` })));
    expect(same.status).toBe(201);
    expect(same.body.data.tenant.slug).not.toBe(`cliente-${id}`);

    expect((await create(tokenB, client({ userPassword: '123' }))).status).toBe(400);
    expect((await create(tokenB, client({ userEmail: 'nao-e-email' }))).status).toBe(400);
  });
});
