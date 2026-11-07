/*
Funcionalidade: cadastro manual com plano de trial técnico

Cenário: catálogo válido
  Dado que trial_new_signup está ativo, gratuito e possui quota 5
  Quando um usuário envia um cadastro válido
  Então recebe 201 e é criada uma assinatura trial de 7 dias sem IDs Asaas

Cenário: catálogo ausente ou inválido
  Dado que trial_new_signup está ausente, inativo, pago ou com quota diferente
  Quando um usuário envia um cadastro válido
  Então recebe 503 INVALID_TRIAL_PLAN e a transação não deixa tenant, usuário ou assinatura
*/
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import app from '../index.js';
import { db, plans, subscriptions, tenants, users } from '@fury/db';

const TRIAL_KEY = 'trial_new_signup';
const validPlan = {
  name: 'Trial 7 dias',
  technicalKey: TRIAL_KEY,
  priceCents: 0,
  interval: 'monthly' as const,
  features: { studio: true, downloads: true, metaPublishing: false },
  limits: { creativesPerMonth: 5 },
  isActive: true,
};

async function restoreTrialPlan() {
  const existing = await db.query.plans.findFirst({
    where: eq(plans.technicalKey, TRIAL_KEY),
  });
  if (existing) {
    await db.update(plans).set(validPlan).where(eq(plans.id, existing.id));
  } else {
    await db.insert(plans).values(validPlan);
  }
}

describe('POST /api/auth/register com o plano técnico de trial', () => {
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeEach(async () => {
    await db.delete(users);
    await db.delete(tenants);
    await restoreTrialPlan();
  });

  afterEach(async () => {
    await restoreTrialPlan();
  });

  async function register(email: string) {
    return request(app).post('/api/auth/register').send({
      name: 'Pessoa de Teste',
      email,
      password: 'SecurePass123!',
      companyName: `Empresa ${email}`,
    });
  }

  it('cria tenant, usuário e uma única assinatura trial com o plano técnico', async () => {
    const response = await register(`trial-ok-${unique()}@test.com`);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, data: { user: { tenantId: expect.any(String) } } });
    expect(response.body.data).not.toHaveProperty('tokens');

    const [subscription] = await db.select().from(subscriptions)
      .where(eq(subscriptions.tenantId, response.body.data.user.tenantId));
    expect(subscription).toEqual(expect.objectContaining({
      status: 'trial',
      creativesRemaining: 5,
      asaasCustomerId: null,
      asaasSubscriptionId: null,
    }));
    expect(subscription.trialEndsAt?.getTime()).toBeGreaterThan(Date.now() + (6 * 24 * 60 * 60 * 1000));
    expect(subscription.currentPeriodEnd?.getTime()).toBe(subscription.trialEndsAt?.getTime());
  });

  it.each([
    ['ausente', async () => db.delete(plans).where(eq(plans.technicalKey, TRIAL_KEY))],
    ['inativo', async () => db.update(plans).set({ isActive: false }).where(eq(plans.technicalKey, TRIAL_KEY))],
    ['pago', async () => db.update(plans).set({ priceCents: 1 }).where(eq(plans.technicalKey, TRIAL_KEY))],
    ['com quota divergente', async () => db.update(plans).set({ limits: { creativesPerMonth: 4 } }).where(eq(plans.technicalKey, TRIAL_KEY))],
  ])('reverte o cadastro quando o plano está %s', async (_description, invalidate) => {
    await invalidate();
    const email = `trial-invalid-${unique()}@test.com`;

    const response = await register(email);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'INVALID_TRIAL_PLAN', message: 'O plano de teste não está disponível.' },
    });
    expect(await db.query.users.findFirst({ where: eq(users.email, email) })).toBeUndefined();
    expect(await db.select().from(tenants).where(eq(tenants.name, `Empresa ${email}`))).toEqual([]);
    expect(await db.select().from(subscriptions)).toEqual([]);
  });
});
