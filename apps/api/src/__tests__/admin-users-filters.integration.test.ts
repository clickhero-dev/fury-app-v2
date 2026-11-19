import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';

/** INTEGRAÇÃO — filtros e ordem da lista de usuários do admin. */
describe('Lista de usuários do admin — filtros', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  let superToken: string;
  let partnerToken: string;
  let partnerName: string;
  let partnerId: string;
  let otherPartnerId: string;
  let cliTenant: string;
  let adyTenant: string;

  const asSuper = () => ({ Authorization: `Bearer ${superToken}` });
  const asPartner = () => ({ Authorization: `Bearer ${partnerToken}` });

  async function register(tag: string) {
    const email = `uf-${tag}-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: `UF ${tag}`, email, password, companyName: `UF ${tag} ${id}` });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data as { token: string; user: { id: string; tenantId: string } };
  }

  async function list(query: string, headers = asSuper()) {
    const res = await request(app).get(`/api/admin/users?limit=100&search=${id}&${query}`).set(headers);
    return res;
  }
  const emails = (res: request.Response) => (res.body.data.users as Array<{ email: string }>).map((u) => u.email.split('-')[1]);

  beforeAll(async () => {
    partnerName = `UF Parceiro ${id}`;
    const [p] = await db.insert(schema.adyPartners).values({ name: partnerName, maxTenants: 5 }).returning();
    const [o] = await db.insert(schema.adyPartners).values({ name: `UF Outro ${id}`, maxTenants: 5 }).returning();
    partnerId = p!.id;
    otherPartnerId = o!.id;
    partnerIds.push(partnerId, otherPartnerId);

    const sup = await register('super');
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    superToken = sup.token;

    // conta própria do parceiro: tenant sem partner_id, usuário com partner_id
    const partner = await register('parceiro');
    await db.update(schema.users).set({ platformRole: 'admin_partner', partnerId }).where(eq(schema.users.id, partner.user.id));
    partnerToken = partner.token;

    const cli = await register('cliparc');
    cliTenant = cli.user.tenantId;
    await db.update(schema.tenants).set({ partnerId }).where(eq(schema.tenants.id, cli.user.tenantId));

    const ady = await register('ady');
    adyTenant = ady.user.tenantId;
    await db.insert(schema.users).values([
      { tenantId: ady.user.tenantId, name: 'UF membro', email: `uf-membro-${id}@test.com`, passwordHash: 'x', role: 'member' },
      { tenantId: ady.user.tenantId, name: 'UF admin', email: `uf-admin-${id}@test.com`, passwordHash: 'x', role: 'admin' },
    ]);
    await rbacService.bumpVersion();
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await rbacService.bumpVersion();
  });

  it('sem filtro traz todos, com a origem de cada um', async () => {
    const res = await list('sort=email');
    expect(res.status).toBe(200);
    expect(emails(res)).toEqual(['admin', 'ady', 'cliparc', 'membro', 'parceiro', 'super']);
    const byTag = Object.fromEntries((res.body.data.users as Array<{ email: string; partnerName: string | null }>).map((u) => [u.email.split('-')[1], u.partnerName]));
    expect(byTag).toMatchObject({ parceiro: partnerName, cliparc: partnerName, ady: null, super: null });
  });

  it.each([
    ['super_admin', ['super']],
    ['partner', ['parceiro']],
    ['owner', ['ady', 'cliparc']],
    ['admin', ['admin']],
    ['member', ['membro']],
  ])('cargo %s', async (role, expected) => {
    const res = await list(`role=${role}&sort=email`);
    expect(res.body.data.total).toBe(expected.length);
    expect(emails(res)).toEqual(expected);
  });

  it('origem: ady, todos os parceiros e um parceiro', async () => {
    expect(emails(await list('origin=ady&sort=email'))).toEqual(['admin', 'ady', 'membro', 'super']);
    expect(emails(await list('origin=partner&sort=email'))).toEqual(['cliparc', 'parceiro']);
    expect(emails(await list(`origin=${partnerId}&sort=email`))).toEqual(['cliparc', 'parceiro']);
    expect((await list(`origin=${otherPartnerId}`)).body.data.total).toBe(0);
  });

  it('ordem por cargo agrupa em blocos', async () => {
    const got = emails(await list('sort=role'));
    expect(got.slice(0, 2)).toEqual(['super', 'parceiro']);
    expect([...got.slice(2, 4)].sort()).toEqual(['ady', 'cliparc']);
    expect(got.slice(4)).toEqual(['admin', 'membro']);
  });

  it('valor inválido responde 400 com o motivo', async () => {
    const res = await list('role=dono');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cargo/);
    expect((await list('origin=xyz')).status).toBe(400);
    expect((await list('sort=x')).status).toBe(400);
  });

  it('parceiro: origem é ignorada e o escopo continua só nos clientes dele', async () => {
    const res = await list('origin=ady', asPartner());
    expect(res.status).toBe(200);
    expect(emails(res)).toEqual(['cliparc']);
    expect(emails(await list('role=member', asPartner()))).toEqual([]);
  });

  it('filtro por cliente: super vê os usuários dele; parceiro não alcança cliente de fora', async () => {
    expect(emails(await list(`tenantId=${adyTenant}&sort=email`))).toEqual(['admin', 'ady', 'membro']);
    expect(emails(await list(`tenantId=${cliTenant}`, asPartner()))).toEqual(['cliparc']);
    expect((await list(`tenantId=${adyTenant}`, asPartner())).body.data.total).toBe(0);
    expect((await list('tenantId=xyz')).status).toBe(400);
  });

  it('dono da conta de parceiro excluído vira ady; cliente do parceiro mantém o nome', async () => {
    await db.update(schema.adyPartners).set({ deletedAt: new Date() }).where(eq(schema.adyPartners.id, partnerId));
    try {
      const res = await list('sort=email');
      const byTag = Object.fromEntries((res.body.data.users as Array<{ email: string; partnerName: string | null }>).map((u) => [u.email.split('-')[1], u.partnerName]));
      expect(byTag.parceiro).toBeNull();
      expect(byTag.cliparc).toBe(partnerName);
      expect(emails(await list('origin=ady&sort=email'))).toContain('parceiro');
    } finally {
      await db.update(schema.adyPartners).set({ deletedAt: null }).where(eq(schema.adyPartners.id, partnerId));
    }
  });
});
