import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';
import { daysAgoSaoPauloYMD } from '../utils/date-sao-paulo.js';

/**
 * INTEGRAÇÃO — pagamento único do parceiro (só super_admin): registrar, ver, excluir.
 */
describe('Pagamento do parceiro — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  let superToken: string;
  let partnerToken: string;
  let partnerA: string;
  let partnerB: string;

  const asSuper = () => ({ Authorization: `Bearer ${superToken}` });
  const asPartner = () => ({ Authorization: `Bearer ${partnerToken}` });
  const login = (email: string) => request(app).post('/api/auth/login').send({ email, password });

  async function createPartner(tag: string) {
    const res = await request(app).post('/api/admin/partners').set(asSuper()).send({
      name: `Pag ${tag} ${id}`, maxTenants: 2, accountName: 'Dona', accountEmail: `pp-${tag}-${id}@test.com`, accountPassword: password,
    });
    partnerIds.push(res.body.data.id);
    const [acc] = await db.select().from(schema.users).where(eq(schema.users.email, `pp-${tag}-${id}@test.com`));
    tenantIds.push(acc!.tenantId);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    const email = `pp-super-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'Super', email, password, companyName: `PP ${id}` });
    const sup = (await login(email)).body.data;
    tenantIds.push(sup.user.tenantId);
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    await rbacService.bumpVersion();
    superToken = sup.token;
    partnerA = await createPartner('a');
    partnerB = await createPartner('b');
    partnerToken = (await login(`pp-a-${id}@test.com`)).body.data.token;
  });

  afterAll(async () => {
    await db.delete(schema.adyPartnerPayments).where(inArray(schema.adyPartnerPayments.partnerId, partnerIds));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await rbacService.bumpVersion();
  });

  it('sem pagamento devolve null', async () => {
    const res = await request(app).get(`/api/admin/partners/${partnerA}/payment`).set(asSuper());
    expect(res.status).toBe(200);
    expect(res.body.data.payment).toBeNull();
  });

  it('valida valor e data com o motivo em português', async () => {
    const cases = [
      { body: { paidAt: daysAgoSaoPauloYMD(1), amountCents: 0 }, msg: /maior que zero/ },
      { body: { paidAt: daysAgoSaoPauloYMD(1), amountCents: -5 }, msg: /maior que zero/ },
      { body: { paidAt: daysAgoSaoPauloYMD(1), amountCents: 10.5 }, msg: /centavos/ },
      { body: { paidAt: daysAgoSaoPauloYMD(-2), amountCents: 100 }, msg: /futura/ },
      { body: { paidAt: '2026-02-30', amountCents: 100 }, msg: /Data inválida/ },
      { body: { paidAt: '30/01/2026', amountCents: 100 }, msg: /AAAA-MM-DD/ },
      { body: { paidAt: daysAgoSaoPauloYMD(1), amountCents: 100, note: 'x'.repeat(501) }, msg: /500/ },
    ];
    for (const c of cases) {
      const res = await request(app).post(`/api/admin/partners/${partnerA}/payment`).set(asSuper()).send(c.body);
      expect(res.status, JSON.stringify(c.body)).toBe(400);
      expect(res.body.error.message).toMatch(c.msg);
    }
  });

  it('registra o pagamento, com auditoria sem a observação', async () => {
    const paidAt = daysAgoSaoPauloYMD(3);
    const res = await request(app).post(`/api/admin/partners/${partnerA}/payment`).set(asSuper())
      .send({ paidAt, amountCents: 500000, note: 'Venda inicial – 5 vagas' });
    expect(res.status).toBe(201);
    expect(res.body.data.payment).toMatchObject({ amountCents: 500000, paidAt, note: 'Venda inicial – 5 vagas', createdByName: 'Super' });

    const got = await request(app).get(`/api/admin/partners/${partnerA}/payment`).set(asSuper());
    expect(got.body.data.payment.amountCents).toBe(500000);

    const [audit] = await db.select().from(schema.adyRbacAuditLog)
      .where(and(eq(schema.adyRbacAuditLog.partnerId, partnerA), eq(schema.adyRbacAuditLog.action, 'partner_payment_created')));
    expect(audit?.details).toMatchObject({ amountCents: 500000, paidAt });
    expect(JSON.stringify(audit?.details)).not.toContain('Venda inicial');
  });

  it('um pagamento por parceiro: o segundo dá 409', async () => {
    const res = await request(app).post(`/api/admin/partners/${partnerA}/payment`).set(asSuper())
      .send({ paidAt: daysAgoSaoPauloYMD(1), amountCents: 100 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_EXISTS');
  });

  it('pagamento de um parceiro não aparece no outro', async () => {
    const res = await request(app).get(`/api/admin/partners/${partnerB}/payment`).set(asSuper());
    expect(res.body.data.payment).toBeNull();
  });

  it('excluir: só com o id do próprio parceiro; depois libera novo registro', async () => {
    const paymentId = (await request(app).get(`/api/admin/partners/${partnerA}/payment`).set(asSuper())).body.data.payment.id;
    // id do pagamento A pela URL do B = 404, nada removido
    expect((await request(app).delete(`/api/admin/partners/${partnerB}/payment/${paymentId}`).set(asSuper())).status).toBe(404);
    expect((await request(app).delete(`/api/admin/partners/${partnerA}/payment/nao-uuid`).set(asSuper())).status).toBe(404);

    const del = await request(app).delete(`/api/admin/partners/${partnerA}/payment/${paymentId}`).set(asSuper());
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/admin/partners/${partnerA}/payment`).set(asSuper())).body.data.payment).toBeNull();

    const [audit] = await db.select().from(schema.adyRbacAuditLog)
      .where(and(eq(schema.adyRbacAuditLog.partnerId, partnerA), eq(schema.adyRbacAuditLog.action, 'partner_payment_deleted')));
    expect(audit?.details).toMatchObject({ paymentId });

    const again = await request(app).post(`/api/admin/partners/${partnerA}/payment`).set(asSuper())
      .send({ paidAt: daysAgoSaoPauloYMD(0), amountCents: 300000 });
    expect(again.status).toBe(201);
  });

  it('parceiro inexistente = 404', async () => {
    expect((await request(app).get('/api/admin/partners/00000000-0000-0000-0000-000000000000/payment').set(asSuper())).status).toBe(404);
    expect((await request(app).post('/api/admin/partners/nao-uuid/payment').set(asSuper()).send({ paidAt: daysAgoSaoPauloYMD(1), amountCents: 1 })).status).toBe(404);
  });

  it('parceiro (admin_partner) nunca acessa: 403', async () => {
    const pid = partnerA;
    for (const call of [
      request(app).get(`/api/admin/partners/${pid}/payment`),
      request(app).post(`/api/admin/partners/${pid}/payment`).send({ paidAt: daysAgoSaoPauloYMD(1), amountCents: 100 }),
      request(app).delete(`/api/admin/partners/${pid}/payment/00000000-0000-0000-0000-000000000000`),
    ]) {
      expect((await call.set(asPartner())).status).toBe(403);
    }
  });

  it('sem login = 401', async () => {
    expect((await request(app).get(`/api/admin/partners/${partnerA}/payment`)).status).toBe(401);
  });
});
