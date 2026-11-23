import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';
import { daysAgoSaoPauloYMD } from '../utils/date-sao-paulo.js';

/**
 * INTEGRAÇÃO — histórico de pagamentos do parceiro (plano + adicionais; só super_admin).
 */
describe('Pagamento do parceiro — integração', () => {
  const id = Date.now().toString().slice(-8);
  // todo parceiro nasce com plano
  let partnerPlanId: string;
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
      name: `Pag ${tag} ${id}`, maxTenants: 2, accountName: 'Dona', accountEmail: `pp-${tag}-${id}@test.com`, accountPassword: password, partnerPlanId,
    });
    partnerIds.push(res.body.data.id);
    const [acc] = await db.select().from(schema.users).where(eq(schema.users.email, `pp-${tag}-${id}@test.com`));
    tenantIds.push(acc!.tenantId);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    const [pl] = await db.insert(schema.adyPartnerPlans).values({ name: `Plano pp ${id}`, priceCents: 100000, maxTenants: 5 }).returning();
    partnerPlanId = pl!.id;
    const email = `pp-super-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'Super', email, password, companyName: `PP ${id}` });
    const sup = (await login(email)).body.data;
    tenantIds.push(sup.user.tenantId);
    // cadastro público não grava nome; "Registrado por" precisa dele
    await db.update(schema.users).set({ platformRole: 'super_admin', name: 'Super' }).where(eq(schema.users.id, sup.user.id));
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
    await db.delete(schema.adyPartnerPlans).where(eq(schema.adyPartnerPlans.id, partnerPlanId));
    await rbacService.bumpVersion();
  });

  const url = (pid: string, rest = '') => `/api/admin/partners/${pid}/payments${rest}`;
  const list = async (pid: string) => (await request(app).get(url(pid)).set(asSuper())).body.data;

  it('sem pagamento: lista vazia e total zero', async () => {
    const res = await request(app).get(url(partnerA)).set(asSuper());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ totalCents: 0, lastPaidAt: null, payments: [] });
  });

  it('valida tipo, valor, data e descrição com o motivo em português', async () => {
    const d = daysAgoSaoPauloYMD(1);
    const cases = [
      { body: { kind: 'plan', paidAt: d, amountCents: 0 }, msg: /maior que zero/ },
      { body: { kind: 'plan', paidAt: d, amountCents: -5 }, msg: /maior que zero/ },
      { body: { kind: 'plan', paidAt: d, amountCents: 10.5 }, msg: /centavos/ },
      { body: { kind: 'plan', paidAt: d, amountCents: 2_147_483_648 }, msg: /21\.474\.836,47/ },
      { body: { kind: 'plan', paidAt: daysAgoSaoPauloYMD(-2), amountCents: 100 }, msg: /futura/ },
      { body: { kind: 'plan', paidAt: '2026-02-30', amountCents: 100 }, msg: /data inválida/i },
      { body: { kind: 'plan', paidAt: '30/01/2026', amountCents: 100 }, msg: /AAAA-MM-DD/ },
      { body: { kind: 'plan', paidAt: d, amountCents: 100, note: 'x'.repeat(501) }, msg: /500/ },
      { body: { kind: 'outro', paidAt: d, amountCents: 100 }, msg: /plano ou adicional/ },
      { body: { paidAt: d, amountCents: 100 }, msg: /plano ou adicional/ },
      { body: { kind: 'additional', paidAt: d, amountCents: 100 }, msg: /descreva o adicional/i },
      { body: { kind: 'additional', paidAt: d, amountCents: 100, note: '   ' }, msg: /descreva o adicional/i },
    ];
    for (const c of cases) {
      const res = await request(app).post(url(partnerA)).set(asSuper()).send(c.body);
      expect(res.status, JSON.stringify(c.body)).toBe(400);
      expect(res.body.error.message).toMatch(c.msg);
    }
    expect((await list(partnerA)).payments).toHaveLength(0);
  });

  it('registra plano e adicional; lista soma e ordena do mais recente', async () => {
    const planDay = daysAgoSaoPauloYMD(10);
    const addDay = daysAgoSaoPauloYMD(2);
    const plan = await request(app).post(url(partnerA)).set(asSuper())
      .send({ kind: 'plan', paidAt: planDay, amountCents: 249990, note: 'Parceiro Ouro' });
    expect(plan.status).toBe(201);
    expect(plan.body.data.payment).toMatchObject({ kind: 'plan', amountCents: 249990, paidAt: planDay, note: 'Parceiro Ouro', createdByName: 'Super' });

    const add = await request(app).post(url(partnerA)).set(asSuper())
      .send({ kind: 'additional', paidAt: addDay, amountCents: 80000, note: '+5 vagas' });
    expect(add.status).toBe(201);

    const got = await list(partnerA);
    expect(got.totalCents).toBe(329990);
    expect(got.lastPaidAt).toBe(addDay);
    expect(got.payments.map((p: { kind: string }) => p.kind)).toEqual(['additional', 'plan']);
  });

  it('auditoria grava tipo e valor, sem a descrição', async () => {
    const rows = await db.select().from(schema.adyRbacAuditLog)
      .where(and(eq(schema.adyRbacAuditLog.partnerId, partnerA), eq(schema.adyRbacAuditLog.action, 'partner_payment_created')));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => (r.details as { kind: string }).kind).sort()).toEqual(['additional', 'plan']);
    expect(JSON.stringify(rows.map((r) => r.details))).not.toMatch(/Parceiro Ouro|\+5 vagas/);
  });

  it('pagamentos de um parceiro não aparecem no outro', async () => {
    expect((await list(partnerB)).payments).toHaveLength(0);
  });

  it('excluir: só com o id do próprio parceiro; o resto do histórico fica', async () => {
    const paymentId = (await list(partnerA)).payments[0].id;
    // id do A pela URL do B = 404, nada removido
    expect((await request(app).delete(url(partnerB, `/${paymentId}`)).set(asSuper())).status).toBe(404);
    expect((await request(app).delete(url(partnerA, '/nao-uuid')).set(asSuper())).status).toBe(404);
    expect((await list(partnerA)).payments).toHaveLength(2);

    const del = await request(app).delete(url(partnerA, `/${paymentId}`)).set(asSuper());
    expect(del.status).toBe(200);
    const after = await list(partnerA);
    expect(after.payments).toHaveLength(1);
    expect(after.totalCents).toBe(249990);

    const [audit] = await db.select().from(schema.adyRbacAuditLog)
      .where(and(eq(schema.adyRbacAuditLog.partnerId, partnerA), eq(schema.adyRbacAuditLog.action, 'partner_payment_deleted')));
    expect(audit?.details).toMatchObject({ paymentId, kind: 'additional' });
    expect(JSON.stringify(audit?.details)).not.toContain('+5 vagas');
  });

  it('rotas antigas no singular não existem mais', async () => {
    expect((await request(app).get(`/api/admin/partners/${partnerA}/payment`).set(asSuper())).status).toBe(404);
  });

  it('parceiro inexistente = 404', async () => {
    expect((await request(app).get(url('00000000-0000-0000-0000-000000000000')).set(asSuper())).status).toBe(404);
    expect((await request(app).post(url('nao-uuid')).set(asSuper()).send({ kind: 'plan', paidAt: daysAgoSaoPauloYMD(1), amountCents: 1 })).status).toBe(404);
  });

  it('parceiro (admin_partner) nunca acessa: 403', async () => {
    for (const call of [
      request(app).get(url(partnerA)),
      request(app).post(url(partnerA)).send({ kind: 'plan', paidAt: daysAgoSaoPauloYMD(1), amountCents: 100 }),
      request(app).delete(url(partnerA, '/00000000-0000-0000-0000-000000000000')),
    ]) {
      expect((await call.set(asPartner())).status).toBe(403);
    }
  });

  it('sem login = 401', async () => {
    expect((await request(app).get(url(partnerA))).status).toBe(401);
  });
});
