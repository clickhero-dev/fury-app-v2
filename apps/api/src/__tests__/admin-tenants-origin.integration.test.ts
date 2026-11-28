import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';

/** INTEGRAÇÃO — origem de cada cliente na lista do admin (filtro da tela Clientes). */
describe('Lista de clientes do admin — origem', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  let partnerId: string;
  let superToken: string;
  let partnerToken: string;
  let adyTenant: string;
  let clientTenant: string;
  let accountTenant: string;

  async function register(tag: string) {
    const email = `to-${tag}-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: `TO ${tag}`, email, password, companyName: `TO ${tag} ${id}` });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data as { token: string; user: { id: string; tenantId: string } };
  }

  beforeAll(async () => {
    const [p] = await db.insert(schema.adyPartners).values({ name: `TO Parceiro ${id}`, maxTenants: 5 }).returning();
    partnerId = p!.id;

    const sup = await register('super');
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    superToken = sup.token;

    const partner = await register('parceiro');
    await db.update(schema.users).set({ platformRole: 'admin_partner', partnerId }).where(eq(schema.users.id, partner.user.id));
    partnerToken = partner.token;
    accountTenant = partner.user.tenantId;

    const cli = await register('cli');
    clientTenant = cli.user.tenantId;
    await db.update(schema.tenants).set({ partnerId }).where(eq(schema.tenants.id, clientTenant));

    adyTenant = (await register('ady')).user.tenantId;
    await rbacService.bumpVersion();
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(eq(schema.adyPartners.id, partnerId));
    await rbacService.bumpVersion();
  });

  it('super recebe ady, cliente de parceiro e conta do parceiro com o nome', async () => {
    const res = await request(app).get('/api/admin/tenants').set({ Authorization: `Bearer ${superToken}` });
    expect(res.status).toBe(200);
    const byId = new Map((res.body.data as Array<{ id: string; origin: unknown }>).map((t) => [t.id, t.origin]));
    expect(byId.get(adyTenant)).toEqual({ kind: 'ady', partnerId: null, partnerName: null });
    expect(byId.get(clientTenant)).toEqual({ kind: 'partner_client', partnerId, partnerName: `TO Parceiro ${id}` });
    expect(byId.get(accountTenant)).toEqual({ kind: 'partner_account', partnerId, partnerName: `TO Parceiro ${id}` });
  });

  it('conta de parceiro excluído vira ady; cliente dele mantém o nome do parceiro', async () => {
    await db.update(schema.adyPartners).set({ deletedAt: new Date() }).where(eq(schema.adyPartners.id, partnerId));
    try {
      const res = await request(app).get('/api/admin/tenants').set({ Authorization: `Bearer ${superToken}` });
      const byId = new Map((res.body.data as Array<{ id: string; origin: unknown }>).map((t) => [t.id, t.origin]));
      expect(byId.get(accountTenant)).toEqual({ kind: 'ady', partnerId: null, partnerName: null });
      expect(byId.get(clientTenant)).toEqual({ kind: 'partner_client', partnerId, partnerName: `TO Parceiro ${id}` });
    } finally {
      await db.update(schema.adyPartners).set({ deletedAt: null }).where(eq(schema.adyPartners.id, partnerId));
    }
  });

  it('parceiro não recebe o campo origem e continua vendo só os clientes dele', async () => {
    const res = await request(app).get('/api/admin/tenants').set({ Authorization: `Bearer ${partnerToken}` });
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ id: string; origin?: unknown }>;
    expect(rows.map((t) => t.id)).toEqual([clientTenant]);
    expect(rows[0]).not.toHaveProperty('origin');
  });
});
