/*
Funcionalidade: renovar assinatura de forma idempotente no job real
Cenário: ciclo vencido é renovado uma única vez
Dado que uma assinatura ativa vencida usa um plano mensal com cota limitada
Quando o serviço real processa o ciclo e o executamos novamente
Então a vigência avança um mês e a cota é reposta apenas na primeira execução

Cenário: falha isolada preserva outras renovações
Dado que uma assinatura elegível está vencida e outra execução pode alterar o ciclo
Quando o job tenta consumir o mesmo vencimento original
Então somente uma execução registra a renovação e a outra contabiliza o ciclo como ignorado
*/
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, plans, subscriptions, tenants } from '@fury/db';
import { SubscriptionRepository } from '../repository/subscription.repository.js';
import { SubscriptionRenewalService } from '../services/billing/subscription-renewal.service.js';

describe('E2E local: ciclo de renovação com banco real fury_test', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tenantIds: string[] = [];
  const planIds: string[] = [];
  const subscriptionIds: string[] = [];

  afterAll(async () => {
    for (const id of subscriptionIds) await db.delete(subscriptions).where(eq(subscriptions.id, id));
    for (const id of planIds) await db.delete(plans).where(eq(plans.id, id));
    for (const id of tenantIds) await db.delete(tenants).where(eq(tenants.id, id));
  });

  it('estende vigência e repõe cota uma vez; retry do mesmo ciclo não duplica efeito', async () => {
    const [tenant] = await db.insert(tenants).values({ name: `renewal-${suffix}`, slug: `renewal-${suffix}` }).returning();
    tenantIds.push(tenant.id);
    const [plan] = await db.insert(plans).values({
      name: `renewal-${suffix}`,
      priceCents: 100,
      interval: 'monthly',
      limits: { creativesPerMonth: 7 },
      isActive: true,
    }).returning();
    planIds.push(plan.id);
    const originalPeriodEnd = new Date('2026-09-10T00:00:00.000Z');
    const [subscription] = await db.insert(subscriptions).values({
      tenantId: tenant.id,
      planId: plan.id,
      status: 'active',
      isNonExpirable: false,
      currentPeriodEnd: originalPeriodEnd,
      creativesRemaining: 1,
    }).returning();
    subscriptionIds.push(subscription.id);

    const service = new SubscriptionRenewalService(new SubscriptionRepository(''));
    const firstRun = await service.renewAllDue(new Date('2026-09-20T00:00:00.000Z'));
    const afterFirstRun = await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, subscription.id) });
    const secondRun = await service.renewAllDue(new Date('2026-09-20T00:00:00.000Z'));
    const afterSecondRun = await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, subscription.id) });

    expect(firstRun).toEqual({ renewed: 1, skipped: 0 });
    expect(afterFirstRun?.currentPeriodEnd?.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(afterFirstRun?.creativesRemaining).toBe(7);
    expect(secondRun).toEqual({ renewed: 0, skipped: 0 });
    expect(afterSecondRun?.currentPeriodEnd?.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(afterSecondRun?.creativesRemaining).toBe(7);
  });

  it('concorrência no mesmo ciclo tem um único vencedor pelo compare-and-set', async () => {
    const [tenant] = await db.insert(tenants).values({ name: `race-${suffix}`, slug: `race-${suffix}` }).returning();
    tenantIds.push(tenant.id);
    const [plan] = await db.insert(plans).values({
      name: `race-${suffix}`,
      priceCents: 100,
      interval: 'monthly',
      limits: { creativesPerMonth: 9 },
      isActive: true,
    }).returning();
    planIds.push(plan.id);
    const [subscription] = await db.insert(subscriptions).values({
      tenantId: tenant.id,
      planId: plan.id,
      status: 'active',
      isNonExpirable: false,
      currentPeriodEnd: new Date('2026-09-10T00:00:00.000Z'),
      creativesRemaining: 0,
    }).returning();
    subscriptionIds.push(subscription.id);
    const repository = new SubscriptionRepository('');

    const outcomes = await Promise.all([
      repository.renewSubscription(subscription.id, new Date('2026-09-10T00:00:00.000Z'), new Date('2026-10-10T00:00:00.000Z'), 9),
      repository.renewSubscription(subscription.id, new Date('2026-09-10T00:00:00.000Z'), new Date('2026-10-10T00:00:00.000Z'), 9),
    ]);
    const finalState = await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.id, subscription.id), eq(subscriptions.status, 'active')) });

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(finalState?.currentPeriodEnd?.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(finalState?.creativesRemaining).toBe(9);
  });
});
