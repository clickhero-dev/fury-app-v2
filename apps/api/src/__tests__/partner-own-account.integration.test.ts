import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';
import { consumeCreativeQuota, getCreativeQuotaSnapshot } from '../services/studio/creative-quota.service.js';
import { loadVideoLimits } from '../services/studio/studio-video.service.js';

/**
 * INTEGRAÇÃO — conta própria do parceiro: sem assinatura, cota e vídeo ilimitados.
 */
describe('Conta própria do parceiro — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  const planIds: string[] = [];
  let superToken: string;
  let superTenant: string;
  let ownTenant: string;
  let clientPlan: string;

  const asSuper = () => ({ Authorization: `Bearer ${superToken}` });
  const login = (email: string) => request(app).post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    const email = `poa-super-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'Super', email, password, companyName: `POA ${id}` });
    const sup = (await login(email)).body.data;
    superTenant = sup.user.tenantId;
    tenantIds.push(superTenant);
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    await rbacService.bumpVersion();
    superToken = sup.token;

    const [pp] = await db.insert(schema.adyPartnerPlans).values({ name: `POA Ouro ${id}`, priceCents: 1000, maxTenants: 2 }).returning();
    planIds.push(pp!.id);
    // plano do parceiro sem Calendário
    await db.insert(schema.adyPartnerPlanViewsBlocked).values({ partnerPlanId: pp!.id, viewKey: 'calendar' });
    const res = await request(app).post('/api/admin/partners').set(asSuper()).send({
      name: `POA ${id}`, partnerPlanId: pp!.id, accountName: 'Dona', accountEmail: `poa-acc-${id}@test.com`, accountPassword: password,
    });
    partnerIds.push(res.body.data.id);
    const [acc] = await db.select().from(schema.users).where(eq(schema.users.email, `poa-acc-${id}@test.com`));
    ownTenant = acc!.tenantId;
    tenantIds.push(ownTenant);

    // plano de cliente da ady com cota zerada, para provar que a conta do parceiro ignora
    const [cp] = await db.insert(schema.plans).values({ name: `POA cliente ${id}`, priceCents: 100, limits: { creativesPerMonth: 0 } }).returning();
    clientPlan = cp!.id;
  });

  afterAll(async () => {
    await db.delete(schema.subscriptions).where(inArray(schema.subscriptions.tenantId, tenantIds));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await db.delete(schema.adyPartnerPlans).where(inArray(schema.adyPartnerPlans.id, planIds));
    await db.delete(schema.plans).where(eq(schema.plans.id, clientPlan));
    await rbacService.bumpVersion();
  });

  it('detalhe do cliente identifica a conta do parceiro e o plano', async () => {
    const res = await request(app).get(`/api/admin/tenants/${ownTenant}`).set(asSuper());
    expect(res.status).toBe(200);
    expect(res.body.data.partnerAccount).toEqual({ partnerId: partnerIds[0], partnerName: `POA ${id}`, planName: `POA Ouro ${id}` });

    const ady = await request(app).get(`/api/admin/tenants/${superTenant}`).set(asSuper());
    expect(ady.body.data.partnerAccount).toBeNull();
  });

  it('não aceita assinatura nem reset de cota, com o motivo', async () => {
    const sub = await request(app).patch(`/api/admin/tenants/${ownTenant}/subscription`).set(asSuper()).send({ planId: clientPlan, status: 'active' });
    expect(sub.status).toBe(409);
    expect(sub.body.error.code).toBe('PARTNER_ACCOUNT_NO_SUBSCRIPTION');
    expect(sub.body.error.message).toContain(`POA ${id}`);

    const reset = await request(app).post(`/api/admin/tenants/${ownTenant}/reset-quota`).set(asSuper());
    expect(reset.status).toBe(409);
    expect(reset.body.error.code).toBe('PARTNER_ACCOUNT_NO_SUBSCRIPTION');
  });

  it('cliente da ady continua aceitando assinatura', async () => {
    const res = await request(app).patch(`/api/admin/tenants/${superTenant}/subscription`).set(asSuper()).send({ planId: clientPlan, status: 'active' });
    expect(res.status).toBe(200);
  });

  it('imagens e vídeo ilimitados, mesmo com assinatura antiga zerada', async () => {
    await db.insert(schema.subscriptions).values({ tenantId: ownTenant, planId: clientPlan, status: 'active', creativesRemaining: 0, currentPeriodEnd: new Date(Date.now() + 864e5) });
    await expect(consumeCreativeQuota(ownTenant)).resolves.toBeUndefined();
    expect(await getCreativeQuotaSnapshot(ownTenant)).toEqual({ creativesRemaining: null, creativesLimit: null });
    const video = await loadVideoLimits(ownTenant);
    expect(video).toMatchObject({ videosPerMonth: null, modificationsPerVideo: null });
  });

  it('cliente comum sem assinatura continua com vídeo desligado', async () => {
    const [t] = await db.insert(schema.tenants).values({ name: `POA solto ${id}`, slug: `poa-solto-${id}` }).returning();
    tenantIds.push(t!.id);
    expect(await loadVideoLimits(t!.id)).toMatchObject({ videosPerMonth: 0 });
  });

  it('usuário da conta do parceiro segue o plano do parceiro: sem assinatura e com as telas dele', async () => {
    const created = await request(app).post('/api/admin/users').set(asSuper()).send({
      tenantId: ownTenant, name: 'Equipe', email: `poa-member-${id}@test.com`, password, role: 'member',
    });
    expect(created.status).toBe(201);
    await rbacService.bumpVersion();
    const token = (await login(`poa-member-${id}@test.com`)).body.data.token;
    const auth = { Authorization: `Bearer ${token}` };

    // não cai em "sem assinatura" e vê o saldo como ilimitado
    const quota = await request(app).get('/api/planner/quota').set(auth);
    expect(quota.status).toBe(200);
    expect(quota.body.data).toEqual({ creativesRemaining: null, creativesLimit: null });

    // telas do plano do parceiro valem para ele
    const views = await request(app).get('/api/rbac/blocked-views').set(auth);
    expect(views.body.data.blocked).toContain('calendar');
    expect((await request(app).get('/api/planner/calendar').set(auth)).status).toBe(403);
  });

  it('parceiro excluído: a conta deixa de ser ilimitada', async () => {
    await db.update(schema.adyPartners).set({ deletedAt: new Date() }).where(eq(schema.adyPartners.id, partnerIds[0]!));
    try {
      expect(await loadVideoLimits(ownTenant)).not.toMatchObject({ videosPerMonth: null });
    } finally {
      await db.update(schema.adyPartners).set({ deletedAt: null }).where(eq(schema.adyPartners.id, partnerIds[0]!));
    }
  });

  it('equipe criada na conta do parceiro já nasce do parceiro', async () => {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, `poa-member-${id}@test.com`));
    expect(u).toMatchObject({ platformRole: 'user_partner', partnerId: partnerIds[0] });
  });

  it('migração 0078 liga ao parceiro quem já existia como cliente ady na conta dele', async () => {
    const [legacy] = await db.insert(schema.users).values({ tenantId: ownTenant, email: `poa-legacy-${id}@test.com`, passwordHash: 'x', role: 'member' }).returning();
    expect(legacy!.platformRole).toBe('user');
    const file = readFileSync(new URL('../../../../packages/db/migrations/0078_partner_account_members.sql', import.meta.url), 'utf8');
    await db.execute(sql.raw(file.split('--> statement-breakpoint')[0]!));
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, legacy!.id));
    expect(after).toMatchObject({ platformRole: 'user_partner', partnerId: partnerIds[0] });
    // cliente ady de fora não é tocado
    const [ady] = await db.select().from(schema.users).where(eq(schema.users.tenantId, superTenant));
    expect(ady!.platformRole).toBe('super_admin');
  });

  it('login avisa a tela que é conta do parceiro (parceiro e equipe); cliente ady não', async () => {
    const member = await login(`poa-member-${id}@test.com`);
    expect(member.body.data.user.partnerAccount).toBe(true);
    const partner = await login(`poa-acc-${id}@test.com`);
    expect(partner.body.data.user.partnerAccount).toBe(true);
    const ady = `poa-ady-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'Ady', email: ady, password, companyName: `POA ady ${id}` });
    const adyLogin = await login(ady);
    tenantIds.push(adyLogin.body.data.user.tenantId);
    expect(adyLogin.body.data.user.partnerAccount).toBe(false);
  });

  it('conta do parceiro não vê preços da ady, não assina e não recebe avisos da ady', async () => {
    const [ann] = await db.insert(schema.announcements).values({ title: `POA aviso ${id}`, markdown: 'x', isActive: true, showToNewUsers: true, publishedAt: new Date() }).returning();
    try {
      for (const email of [`poa-member-${id}@test.com`, `poa-acc-${id}@test.com`]) {
        const auth = { Authorization: `Bearer ${(await login(email)).body.data.token}` };
        const plans = await request(app).get('/api/billing/plans').set(auth);
        expect(plans.status, email).toBe(200);
        expect(plans.body.data, email).toEqual([]);
        const sub = await request(app).post('/api/billing/subscribe').set(auth)
          .send({ planId: clientPlan, billingType: 'PIX', customerName: 'Teste', customerEmail: 'poa@test.com', customerCpfCnpj: '12345678909' });
        expect(sub.status, email).toBe(403);
        expect(sub.body.error.message, email).not.toMatch(/parceiro/i);
        const pend = await request(app).get('/api/announcements/pending').set(auth);
        expect(JSON.stringify(pend.body), email).not.toContain(`POA aviso ${id}`);
      }
    } finally {
      await db.delete(schema.announcements).where(eq(schema.announcements.id, ann!.id));
    }
  });

  it('parceiro excluído: a equipe dele fica bloqueada em tudo (na dúvida, não libera)', async () => {
    const auth = { Authorization: `Bearer ${(await login(`poa-member-${id}@test.com`)).body.data.token}` };
    await db.update(schema.adyPartners).set({ deletedAt: new Date() }).where(eq(schema.adyPartners.id, partnerIds[0]!));
    await rbacService.bumpVersion();
    try {
      const views = await request(app).get('/api/rbac/blocked-views').set(auth);
      expect(views.body.data.blocked).toEqual(expect.arrayContaining(['goals', 'campaigns', 'studio', 'calendar']));
      expect((await request(app).get('/api/goals').set(auth)).status).toBe(403);
    } finally {
      await db.update(schema.adyPartners).set({ deletedAt: null }).where(eq(schema.adyPartners.id, partnerIds[0]!));
      await rbacService.bumpVersion();
    }
    // parceiro de volta: a equipe volta a ter as telas do plano
    expect((await request(app).get('/api/goals').set(auth)).status).not.toBe(403);
  });
});
