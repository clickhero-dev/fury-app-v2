import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';
import adminRouter, { partnerRouter } from '../routes/superadmin.routes.js';

/**
 * INTEGRAÇÃO (app real + banco de teste + Redis local) — admin do parceiro.
 * Parceiro A só enxerga os clientes dele; cliente do parceiro B e cliente da ady = 404.
 */
describe('Escopo do parceiro no admin — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  let superToken: string;
  let partnerToken: string;
  let clientA: string;
  let clientB: string;
  let clientAdy: string;
  let userB: string;
  let userA: string;
  let partnerA: string;

  const asPartner = () => ({ Authorization: `Bearer ${partnerToken}` });
  const asSuper = () => ({ Authorization: `Bearer ${superToken}` });

  async function register(tag: string) {
    const email = `ps-${tag}-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'PS', email, password, companyName: `PS ${tag} ${id}` });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data as { token: string; user: { id: string; tenantId: string } };
  }

  async function newPartner(name: string) {
    const [p] = await db.insert(schema.adyPartners).values({ name: `${name} ${id}`, maxTenants: 5 }).returning();
    partnerIds.push(p!.id);
    return p!.id;
  }

  beforeAll(async () => {
    partnerA = await newPartner('Parceiro A');
    const partnerB = await newPartner('Parceiro B');

    const sup = await register('super');
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    superToken = sup.token;

    const partner = await register('partner');
    await db.update(schema.users).set({ platformRole: 'admin_partner', partnerId: partnerA }).where(eq(schema.users.id, partner.user.id));
    partnerToken = partner.token;

    const a = await register('cli-a');
    clientA = a.user.tenantId;
    userA = a.user.id;
    await db.update(schema.tenants).set({ partnerId: partnerA }).where(eq(schema.tenants.id, clientA));

    const b = await register('cli-b');
    clientB = b.user.tenantId;
    userB = b.user.id;
    await db.update(schema.tenants).set({ partnerId: partnerB }).where(eq(schema.tenants.id, clientB));

    clientAdy = (await register('cli-ady')).user.tenantId;
    await rbacService.bumpVersion();
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await rbacService.bumpVersion();
  });

  it('lista de clientes, usuários e dashboard só com os clientes do parceiro', async () => {
    const list = await request(app).get('/api/admin/tenants').set(asPartner());
    expect(list.status).toBe(200);
    expect(list.body.data.map((t: { id: string }) => t.id)).toEqual([clientA]);

    const users = await request(app).get('/api/admin/users').query({ search: `ps-cli` }).set(asPartner());
    expect(users.body.data.users.map((u: { tenantId: string }) => u.tenantId)).toEqual([clientA]);

    const dash = await request(app).get('/api/admin/dashboard').set(asPartner());
    expect(dash.status).toBe(200);
    expect(dash.body.data.newClients).toBe(1);
    expect((await request(app).get('/api/admin/dashboard').set(asSuper())).status).toBe(200);

    const all = await request(app).get('/api/admin/tenants').set(asSuper());
    expect(all.body.data.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([clientA, clientB, clientAdy]));
  });

  it('cliente de outro parceiro ou da ady → 404', async () => {
    for (const other of [clientB, clientAdy]) {
      expect((await request(app).get(`/api/admin/tenants/${other}`).set(asPartner())).status).toBe(404);
      expect((await request(app).get(`/api/admin/tenants/${other}/campaigns`).set(asPartner())).status).toBe(404);
      expect((await request(app).delete(`/api/admin/tenants/${other}`).set(asPartner())).status).toBe(404);
      const user = await request(app)
        .post('/api/admin/users')
        .set(asPartner())
        .send({ tenantId: other, name: 'X', email: `ps-x-${other.slice(0, 8)}-${id}@test.com`, password });
      expect(user.status).toBe(404);
    }
    expect((await request(app).get(`/api/admin/tenants/${clientA}/campaigns`).set(asPartner())).status).toBe(200);
    expect((await request(app).patch(`/api/admin/users/${userB}`).set(asPartner()).send({ name: 'Y' })).status).toBe(404);
    expect((await request(app).delete(`/api/admin/users/${userB}`).set(asPartner())).status).toBe(404);
  });

  it('usuário criado em cliente do parceiro vira user_partner', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set(asPartner())
      .send({ tenantId: clientA, name: 'Membro', email: `ps-member-${id}@test.com`, password, role: 'member' });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, res.body.data.id));
    expect(row?.platformRole).toBe('user_partner');
  });

  it('cargo Admin: só o super_admin dá ou tira', async () => {
    const created = await request(app)
      .post('/api/admin/users')
      .set(asPartner())
      .send({ tenantId: clientA, name: 'Adm', email: `ps-adm-${id}@test.com`, password, role: 'admin' });
    expect(created.status).toBe(403);
    expect((await request(app).patch(`/api/admin/users/${userA}`).set(asPartner()).send({ role: 'admin' })).status).toBe(403);

    expect((await request(app).patch(`/api/admin/users/${userA}`).set(asSuper()).send({ role: 'admin' })).status).toBe(200);
    expect((await request(app).patch(`/api/admin/users/${userA}`).set(asPartner()).send({ role: 'member' })).status).toBe(403);
    // editar só o nome (a tela manda o cargo igual) continua liberado
    expect((await request(app).patch(`/api/admin/users/${userA}`).set(asPartner()).send({ name: 'Novo', role: 'admin' })).status).toBe(200);
  });

  it('conta de admin dentro do cliente fica fora do alcance do parceiro', async () => {
    const [other] = await db
      .insert(schema.users)
      .values({ tenantId: clientA, email: `ps-other-adm-${id}@test.com`, platformRole: 'admin_partner', partnerId: partnerA })
      .returning();
    const users = await request(app).get('/api/admin/users').query({ search: `ps-other-adm-${id}` }).set(asPartner());
    expect(users.body.data.total).toBe(0);
    expect((await request(app).patch(`/api/admin/users/${other!.id}`).set(asPartner()).send({ name: 'X' })).status).toBe(404);
    expect((await request(app).delete(`/api/admin/users/${other!.id}`).set(asPartner())).status).toBe(404);
    const total = await request(app).get('/api/admin/users').query({ search: `ps-other-adm-${id}` }).set(asSuper());
    expect(total.body.data.total).toBe(1);
  });

  it('rotas só do super_admin → 403 para o parceiro', async () => {
    const calls = [
      request(app).patch(`/api/admin/tenants/${clientA}/subscription`).send({ status: 'active' }),
      request(app).post(`/api/admin/tenants/${clientA}/reset-quota`),
      request(app).post('/api/admin/setup-tenant').send({}),
      request(app).get('/api/admin/plans'),
      request(app).get('/api/admin/tickets'),
      request(app).get('/api/admin/healthchecks/users'),
    ];
    for (const call of calls) expect((await call.set(asPartner())).status).toBe(403);
  });

  it('parceiro exclui (soft) o próprio cliente', async () => {
    expect((await request(app).delete(`/api/admin/tenants/${clientA}`).set(asPartner())).status).toBe(200);
    const [row] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, clientA));
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});

// Rota nova no admin fica só do super_admin; liberar ao parceiro exige mudar esta lista
describe('Rotas do admin liberadas ao parceiro', () => {
  type Layer = { name: string; route?: { path: string; methods: Record<string, boolean> } };
  const routesOf = (stack: Layer[]) =>
    stack.filter((l) => l.route).flatMap((l) => Object.keys(l.route!.methods).map((m) => `${m.toUpperCase()} ${l.route!.path}`));

  it('lista fechada', () => {
    expect(routesOf((partnerRouter as any).stack).sort()).toEqual([
      'DELETE /tenants/:id',
      'DELETE /users/:id',
      'GET /dashboard',
      'GET /tenants',
      'GET /tenants/:id',
      'GET /tenants/:tenantId/brand-kit',
      'GET /tenants/:tenantId/campaigns',
      'GET /users',
      'GET /users/check-email/:email',
      'PATCH /tenants/:tenantId/audience',
      'PATCH /tenants/:tenantId/brand-kit',
      'PATCH /tenants/:tenantId/fury-config',
      'PATCH /users/:id',
      'POST /users',
      'PUT /tenants/:tenantId/goals',
    ]);
  });

  it('todas as outras rotas vêm depois do superadminMiddleware', () => {
    const stack: Layer[] = (adminRouter as any).stack;
    const guard = stack.findIndex((l) => l.name === 'superadminMiddleware');
    expect(guard).toBeGreaterThan(-1);
    stack.forEach((l, i) => {
      if (l.route) expect(i).toBeGreaterThan(guard);
    });
  });
});
