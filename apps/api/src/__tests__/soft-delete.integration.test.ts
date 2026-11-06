import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';
import { SuperAdminRepository } from '../repository/superadmin.repository.js';
import { getMetaSyncTenantIds } from '../workers/meta-sync.worker.js';

/**
 * INTEGRAÇÃO (app real + banco de teste + Redis local) — soft-delete de cliente e usuário.
 * Excluído some do admin, perde o acesso (login, refresh, token) e o e-mail continua preso.
 */
describe('Soft-delete de cliente e usuário — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const ownerEmail = `sd-owner-${id}@test.com`;
  const memberEmail = `sd-member-${id}@test.com`;
  const adminEmail = `sd-admin-${id}@test.com`;
  const tenantIds: string[] = [];
  let adminToken: string;
  let ownerToken: string;
  let ownerRefresh: string;
  let tenantId: string;
  let memberId: string;
  let memberToken: string;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const login = (email: string) => request(app).post('/api/auth/login').send({ email, password });

  async function register(email: string, company: string) {
    await request(app).post('/api/auth/register').send({ name: 'SD', email, password, companyName: company });
    const res = await login(email);
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data;
  }

  beforeAll(async () => {
    const admin = await register(adminEmail, `SD Admin ${id}`);
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, admin.user.id));
    await rbacService.bumpVersion();
    adminToken = admin.token;

    const owner = await register(ownerEmail, `SD Cliente ${id}`);
    ownerToken = owner.token;
    ownerRefresh = owner.refreshToken;
    tenantId = owner.user.tenantId;

    const created = await request(app)
      .post('/api/admin/users')
      .set(asAdmin())
      .send({ tenantId, name: 'Membro', email: memberEmail, password, role: 'member' });
    expect(created.status).toBe(201);
    memberId = created.body.data.id;
    memberToken = (await login(memberEmail)).body.data.token;
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await rbacService.bumpVersion();
  });

  it('excluir usuário: some do cliente, perde o acesso e o e-mail continua preso', async () => {
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${memberToken}` })).status).toBe(200);

    expect((await request(app).delete(`/api/admin/users/${memberId}`).set(asAdmin())).status).toBe(200);

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, memberId));
    expect(row?.deletedAt).toBeInstanceOf(Date);

    expect((await login(memberEmail)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${memberToken}` })).status).toBe(401);

    // direto no repo: o detalhe do cliente esbarra no brand_kits.whatsapp_number ausente no fury_test
    const tenantUsers = await new SuperAdminRepository().listUsersByTenant(tenantId);
    expect(tenantUsers.map((u) => u.id)).not.toContain(memberId);

    const users = await request(app).get('/api/admin/users').query({ search: memberEmail }).set(asAdmin());
    expect(users.body.data.total).toBe(0);

    const email = await request(app).get(`/api/admin/users/check-email/${memberEmail}`).set(asAdmin());
    expect(email.body.data.exists).toBe(true);

    expect((await request(app).delete(`/api/admin/users/${memberId}`).set(asAdmin())).status).toBe(404);
  });

  it('excluir cliente: some do admin e todos os usuários dele perdem o acesso', async () => {
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${ownerToken}` })).status).toBe(200);
    await db.insert(schema.metaConnections).values({
      tenantId,
      metaUserId: `mu_sd_${id}`,
      accessToken: 'tok',
      selectedAdAccountId: `act_sd_${id}`,
    } as any);
    expect(await getMetaSyncTenantIds()).toContain(tenantId);

    expect((await request(app).delete(`/api/admin/tenants/${tenantId}`).set(asAdmin())).status).toBe(200);
    // tarefas automáticas param de processar o cliente excluído
    expect(await getMetaSyncTenantIds()).not.toContain(tenantId);

    const [row] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    expect(row?.deletedAt).toBeInstanceOf(Date);

    expect((await login(ownerEmail)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${ownerToken}` })).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: ownerRefresh })).status).toBe(401);

    const list = await request(app).get('/api/admin/tenants').set(asAdmin());
    expect(list.body.data.map((t: { id: string }) => t.id)).not.toContain(tenantId);
    expect((await request(app).get(`/api/admin/tenants/${tenantId}`).set(asAdmin())).status).toBe(404);

    const again = await request(app)
      .post('/api/auth/register')
      .send({ name: 'SD', email: ownerEmail, password, companyName: `SD Outra ${id}` });
    expect(again.status).toBe(409);
  });
});
