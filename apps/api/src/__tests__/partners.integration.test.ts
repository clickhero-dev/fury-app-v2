import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';

/**
 * INTEGRAÇÃO (app real + banco de teste + Redis local) — tela de Parceiros (super_admin).
 * Cria parceiro com conta própria, limite de vagas e restauração de cliente excluído.
 */
describe('Parceiros (super_admin) — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  let superToken: string;
  let partnerId: string;
  let partnerToken: string;

  const asSuper = () => ({ Authorization: `Bearer ${superToken}` });
  const asPartner = () => ({ Authorization: `Bearer ${partnerToken}` });
  const login = (email: string) => request(app).post('/api/auth/login').send({ email, password });

  async function register(tag: string) {
    const email = `pt-${tag}-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'PT', email, password, companyName: `PT ${tag} ${id}` });
    const res = await login(email);
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data as { token: string; user: { id: string; tenantId: string } };
  }

  beforeAll(async () => {
    const sup = await register('super');
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    await rbacService.bumpVersion();
    superToken = sup.token;
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await rbacService.bumpVersion();
  });

  it('cria parceiro com conta própria fora das vagas', async () => {
    const res = await request(app).post('/api/admin/partners').set(asSuper()).send({
      name: `Parceira ${id}`, maxTenants: 1, accountName: 'Dona', accountEmail: `pt-acc-${id}@test.com`, accountPassword: password,
    });
    expect(res.status).toBe(201);
    partnerId = res.body.data.id;
    partnerIds.push(partnerId);
    expect(res.body.data).toMatchObject({ maxTenants: 1, usedTenants: 0, accountEmail: `pt-acc-${id}@test.com` });

    const [account] = await db.select().from(schema.users).where(eq(schema.users.email, `pt-acc-${id}@test.com`));
    tenantIds.push(account!.tenantId);
    expect(account).toMatchObject({ platformRole: 'admin_partner', partnerId, role: 'admin' });
    const [own] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, account!.tenantId));
    expect(own?.partnerId).toBeNull();

    // a conta entra e vira admin do parceiro
    const acc = await login(`pt-acc-${id}@test.com`);
    expect(acc.status).toBe(200);
    expect(acc.body.data.user.platformRole).toBe('admin_partner');
    partnerToken = acc.body.data.token;
    expect((await request(app).get('/api/admin/tenants').set(asPartner())).body.data).toEqual([]);

    const dup = await request(app).post('/api/admin/partners').set(asSuper()).send({
      name: 'Outra', maxTenants: 1, accountName: 'X', accountEmail: `pt-acc-${id}@test.com`, accountPassword: password,
    });
    expect(dup.status).toBe(409);
  });

  it('parceiro não acessa as rotas de parceiros', async () => {
    for (const call of [
      request(app).get('/api/admin/partners'),
      request(app).patch(`/api/admin/partners/${partnerId}`).send({ maxTenants: 99 }),
      request(app).get('/api/admin/deleted-tenants'),
    ]) {
      expect((await call.set(asPartner())).status).toBe(403);
    }
  });

  it('limite não fica abaixo dos clientes atuais; restaurar respeita o limite', async () => {
    const a = await register('cli-a');
    const b = await register('cli-b');
    await db.update(schema.tenants).set({ partnerId }).where(inArray(schema.tenants.id, [a.user.tenantId, b.user.tenantId]));

    // 2 clientes num limite de 1 (forçado no banco): não aceita baixar nem manter abaixo
    const low = await request(app).patch(`/api/admin/partners/${partnerId}`).set(asSuper()).send({ maxTenants: 1 });
    expect(low.status).toBe(409);
    expect((await request(app).patch(`/api/admin/partners/${partnerId}`).set(asSuper()).send({ maxTenants: 2, name: `Parceira ${id} B` })).status).toBe(200);

    expect((await request(app).delete(`/api/admin/tenants/${a.user.tenantId}`).set(asSuper())).status).toBe(200);
    const deleted = await request(app).get('/api/admin/deleted-tenants').set(asSuper());
    expect(deleted.body.data.map((t: { id: string }) => t.id)).toContain(a.user.tenantId);

    // vaga liberada foi ocupada → restaurar recusa
    const c = await register('cli-c');
    await db.update(schema.tenants).set({ partnerId }).where(eq(schema.tenants.id, c.user.tenantId));
    expect((await request(app).post(`/api/admin/deleted-tenants/${a.user.tenantId}/restore`).set(asSuper())).status).toBe(409);

    // com vaga, restaura e o dono volta a entrar
    await request(app).patch(`/api/admin/partners/${partnerId}`).set(asSuper()).send({ maxTenants: 3 });
    expect((await login(`pt-cli-a-${id}@test.com`)).status).toBe(401);
    expect((await request(app).post(`/api/admin/deleted-tenants/${a.user.tenantId}/restore`).set(asSuper())).status).toBe(200);
    expect((await login(`pt-cli-a-${id}@test.com`)).status).toBe(200);

    const detail = await request(app).get(`/api/admin/partners/${partnerId}`).set(asSuper());
    expect(detail.body.data).toMatchObject({ name: `Parceira ${id} B`, maxTenants: 3, usedTenants: 3 });
  });
});
