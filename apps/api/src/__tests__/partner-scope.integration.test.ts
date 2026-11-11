import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import app from './ready-app.js';
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
    await db.delete(schema.adyRbacAuditLog).where(inArray(schema.adyRbacAuditLog.entityKey, [userA, userB]));
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

  it('dashboard: vencidas e renovações de fora não aparecem para o parceiro', async () => {
    const [plan] = await db.insert(schema.plans).values({ name: `PS plano ${id}`, priceCents: 100 }).returning();
    try {
      const past = new Date(Date.now() - 2 * 86400000);
      const [sub] = await db
        .insert(schema.subscriptions)
        .values({ tenantId: clientB, planId: plan!.id, status: 'active', currentPeriodEnd: past })
        .returning();
      await db.insert(schema.renewalEvents).values({ subscriptionId: sub!.id, tenantId: clientB, previousPeriodEnd: past });

      const dash = await request(app).get('/api/admin/dashboard').set(asPartner());
      expect(dash.body.data.expiredAccounts).toBe(0);
      expect(dash.body.data.recentActivity.filter((a: { tipo: string }) => a.tipo === 'renovacao')).toEqual([]);

      const sup = await request(app).get('/api/admin/dashboard').set(asSuper());
      expect(sup.body.data.expiredAccounts).toBeGreaterThanOrEqual(1);
      expect(sup.body.data.recentActivity.some((a: { tipo: string }) => a.tipo === 'renovacao')).toBe(true);
    } finally {
      await db.delete(schema.subscriptions).where(eq(schema.subscriptions.planId, plan!.id));
      await db.delete(schema.plans).where(eq(schema.plans.id, plan!.id));
    }
  });

  it('avisos só chegam a clientes do ady (nem parceiro nem cliente dele)', async () => {
    const [ann] = await db
      .insert(schema.announcements)
      .values({ title: `PS aviso ${id}`, markdown: 'x', isActive: true, showToNewUsers: true, publishedAt: new Date() })
      .returning();
    try {
      const has = (body: { data: { id: string }[] }) => body.data.some((a) => a.id === ann!.id);
      const ady = await request(app).post('/api/auth/login').send({ email: `ps-cli-ady-${id}@test.com`, password });
      const cliA = await request(app).post('/api/auth/login').send({ email: `ps-cli-a-${id}@test.com`, password });
      const pending = (token: string) => request(app).get('/api/announcements/pending').set({ Authorization: `Bearer ${token}` });

      expect(has((await pending(ady.body.data.token)).body)).toBe(true);
      expect(has((await pending(cliA.body.data.token)).body)).toBe(false);
      expect(has((await pending(partnerToken)).body)).toBe(false);
    } finally {
      await db.delete(schema.announcements).where(eq(schema.announcements.id, ann!.id));
    }
  });

  it('KPIs da plataforma (observability) só para o super_admin', async () => {
    expect((await request(app).get('/api/observability/kpis').set(asPartner())).status).not.toBe(200);
    expect((await request(app).get('/api/observability/kpis').set(asSuper())).status).toBe(200);
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

  it('parceiro só cria Membro, até 2 por cliente, e não troca cargo', async () => {
    const c = await register('cli-limite');
    await db.update(schema.tenants).set({ partnerId: partnerA }).where(eq(schema.tenants.id, c.user.tenantId));
    const add = (tag: string, role?: string, as = asPartner) => request(app).post('/api/admin/users').set(as())
      .send({ tenantId: c.user.tenantId, name: tag, email: `ps-lim-${tag}-${id}@test.com`, password, ...(role ? { role } : {}) });

    expect((await add('owner', 'owner')).status).toBe(403);
    expect((await add('adm', 'admin')).status).toBe(403);

    // simultâneas: só 2 passam
    const all = await Promise.all(['a', 'b', 'c', 'd'].map((t) => add(t)));
    expect(all.map((r) => r.status).sort()).toEqual([201, 201, 409, 409]);
    expect(all.find((r) => r.status === 409)?.body.error.code).toBe('MEMBER_LIMIT');
    const created = all.find((r) => r.status === 201)!.body.data;
    expect(created.role).toBe('member');

    const url = `/api/admin/users/${created.id}`;
    expect((await request(app).patch(url).set(asPartner()).send({ role: 'owner' })).status).toBe(403);
    expect((await request(app).patch(`/api/admin/users/${c.user.id}`).set(asPartner()).send({ role: 'member' })).status).toBe(403);
    // mesmo cargo: editar o nome continua liberado
    expect((await request(app).patch(url).set(asPartner()).send({ name: 'Novo', role: 'member' })).status).toBe(200);

    // removeu um: libera a vaga; super não tem limite
    expect((await request(app).delete(url).set(asPartner())).status).toBe(200);
    expect((await add('e')).status).toBe(201);
    expect((await add('f')).status).toBe(409);
    expect((await add('g', 'member', asSuper)).status).toBe(201);
  });

  it('remover o titular: sai o cliente inteiro, libera a vaga e o parceiro não reavê', async () => {
    const c = await register('cli-titular');
    const tenantId = c.user.tenantId;
    await db.update(schema.tenants).set({ partnerId: partnerA }).where(eq(schema.tenants.id, tenantId));
    await db.update(schema.subscriptions).set({ status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) }).where(eq(schema.subscriptions.tenantId, tenantId));
    const member = await request(app).post('/api/admin/users').set(asPartner())
      .send({ tenantId, name: 'M', email: `ps-tit-m-${id}@test.com`, password });
    expect(member.status).toBe(201);

    const res = await request(app).delete(`/api/admin/users/${c.user.id}`).set(asPartner());
    expect(res.status).toBe(200);
    expect(res.body.data.tenantRemoved).toBe(true);

    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    expect(tenant?.deletedAt).not.toBeNull();
    // cliente some do parceiro; titular e membro perdem o acesso
    expect((await request(app).get(`/api/admin/tenants/${tenantId}`).set(asPartner())).status).toBe(404);
    expect((await request(app).post('/api/auth/login').send({ email: `ps-tit-m-${id}@test.com`, password })).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${c.token}`)).status).toBe(401);
    expect((await request(app).post(`/api/admin/deleted-tenants/${tenantId}/restore`).set(asPartner())).status).toBe(403);

    // remover membro segue só removendo ele
    const other = await request(app).post('/api/admin/users').set(asPartner())
      .send({ tenantId: clientA, name: 'M2', email: `ps-tit-m2-${id}@test.com`, password });
    expect((await request(app).delete(`/api/admin/users/${other.body.data.id}`).set(asPartner())).body.data).toBeNull();
    const [a] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, clientA));
    expect(a?.deletedAt).toBeNull();
  });

  it('integrações: membro só usa; titular passa da checagem', async () => {
    const owner = await register('cli-integ');
    await db.update(schema.tenants).set({ partnerId: partnerA }).where(eq(schema.tenants.id, owner.user.tenantId));
    const email = `ps-integ-m-${id}@test.com`;
    expect((await request(app).post('/api/admin/users').set(asPartner()).send({ tenantId: owner.user.tenantId, name: 'M', email, password })).status).toBe(201);
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const member = { Authorization: `Bearer ${login.body.data.token}` };
    const fake = '00000000-0000-4000-8000-000000000000';

    const blocked = [
      request(app).get('/api/meta/auth/url').set(member),
      request(app).post('/api/meta/save-selection').set(member).send({}),
      request(app).patch(`/api/meta/connections/${fake}/select-account`).set(member).send({}),
      request(app).delete(`/api/meta/connections/${fake}`).set(member),
      request(app).get('/api/google/auth/url').set(member),
      request(app).delete(`/api/google/connections/${fake}`).set(member),
      request(app).put('/api/google/settings').set(member).send({}),
      request(app).post('/api/google/profiles').set(member).send({}),
    ];
    for (const res of await Promise.all(blocked)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INTEGRATION_OWNER_ONLY');
    }
    // membro continua lendo a conexão do titular
    expect((await request(app).get('/api/meta/connections').set(member)).status).toBe(200);
    // titular não é barrado por esta regra
    const asOwner = await request(app).delete(`/api/meta/connections/${fake}`).set('Authorization', `Bearer ${owner.token}`);
    expect(asOwner.body.error?.code).not.toBe('INTEGRATION_OWNER_ONLY');
  });

  it('e-mail não é editável, nem pelo super_admin', async () => {
    for (const as of [asPartner, asSuper]) {
      const res = await request(app).patch(`/api/admin/users/${userA}`).set(as()).send({ email: `ps-novo-${id}@test.com` });
      expect(res.status).toBe(400);
    }
    // mesmo e-mail (sem troca) passa
    expect((await request(app).patch(`/api/admin/users/${userA}`).set(asSuper()).send({ name: 'N', email: `ps-cli-a-${id}@test.com` })).status).toBe(200);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userA));
    expect(row?.email).toBe(`ps-cli-a-${id}@test.com`);
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
      request(app).post('/api/admin/setup-tenant').send({}),
      request(app).get('/api/admin/tickets'),
      request(app).get('/api/admin/healthchecks/users'),
    ];
    for (const call of calls) expect((await call.set(asPartner())).status).toBe(403);
  });

  it('troca de senha pelo suporte: só no escopo, senha forte e derruba as sessões', async () => {
    const [a] = await db.select().from(schema.users).where(eq(schema.users.id, userA));
    const login = (pw: string) => request(app).post('/api/auth/login').send({ email: a!.email, password: pw });
    const before = await login(password);
    expect(before.status).toBe(200);
    const oldRefresh = before.body.data.refreshToken as string;
    const newPassword = 'NovaSenha#2026';

    expect((await request(app).post(`/api/admin/users/${userB}/password`).set(asPartner()).send({ password: newPassword })).status).toBe(404);
    expect((await request(app).post(`/api/admin/users/${userA}/password`).set(asPartner()).send({ password: 'fraca' })).status).toBe(400);
    expect((await request(app).post(`/api/admin/users/${userA}/password`).send({ password: newPassword })).status).toBe(401);

    const res = await request(app).post(`/api/admin/users/${userA}/password`).set(asPartner()).send({ password: newPassword });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(newPassword);

    // antes de logar de novo: token do mesmo segundo sairia igual
    expect(oldRefresh).toBeTruthy();
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh })).status).toBe(401);
    expect((await login(password)).status).toBe(401);
    expect((await login(newPassword)).status).toBe(200);

    // super também alcança cliente de outro parceiro
    expect((await request(app).post(`/api/admin/users/${userB}/password`).set(asSuper()).send({ password: newPassword })).status).toBe(200);

    // histórico: quem trocou, de quem e quando; tentativas recusadas não entram
    const [partnerUser] = await db.select().from(schema.users).where(eq(schema.users.partnerId, partnerA));
    const logs = await db.select().from(schema.adyRbacAuditLog)
      .where(and(eq(schema.adyRbacAuditLog.action, 'user_password_reset'), inArray(schema.adyRbacAuditLog.entityKey, [userA, userB])));
    expect(logs).toHaveLength(2);
    const byPartner = logs.find((l) => l.entityKey === userA)!;
    expect(byPartner).toMatchObject({ actorUserId: partnerUser!.id, entityType: 'user', partnerId: partnerA });
    expect(byPartner.details).toEqual({ tenantId: clientA, email: a!.email, byPartner: true });
    expect(byPartner.createdAt).toBeInstanceOf(Date);
    expect((logs.find((l) => l.entityKey === userB)!.details as { byPartner: boolean }).byPartner).toBe(false);
    expect(JSON.stringify(logs)).not.toContain(newPassword);
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
      'DELETE /my-partner/ai-key',
      'DELETE /plans/:id',
      'DELETE /tenants/:id',
      'DELETE /users/:id',
      'GET /dashboard',
      'GET /my-partner',
      'GET /my-partner/ai-key',
      'GET /plans',
      'GET /tenants',
      'GET /tenants/:id',
      'GET /tenants/:tenantId/assignable-plans',
      'GET /tenants/:tenantId/brand-kit',
      'GET /tenants/:tenantId/campaigns',
      'GET /users',
      'GET /users/check-email/:email',
      'PATCH /plans/:id',
      'PATCH /tenants/:tenantId/audience',
      'PATCH /tenants/:tenantId/brand-kit',
      'PATCH /tenants/:tenantId/fury-config',
      'PATCH /tenants/:tenantId/subscription',
      'PATCH /users/:id',
      'POST /my-partner/clients',
      'POST /plans',
      'POST /tenants/:tenantId/reset-quota',
      'POST /users',
      'POST /users/:id/password',
      'PUT /my-partner/ai-key',
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
