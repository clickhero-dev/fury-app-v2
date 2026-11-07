/*
 * Funcionalidade: assinatura Trial padrão
 * Cenários:
 * - Dado o plano Trial configurado, quando provisiona, então aplica 7 dias e 5 criações.
 * - Dado um plano com preço ou limites divergentes, quando provisiona, então rejeita a configuração.
 */
import { describe, expect, it } from 'vitest';
import { buildDefaultTrialSubscription } from '../lib/trial-plan.js';

const plan = {
  id: 'plan-trial', priceCents: 0, isActive: true,
  features: { trialDays: 7, images: 5, revisionsPerImage: 3, videos: false },
  limits: { creativesPerMonth: 5, modificationsPerCreative: 3, videosPerMonth: 0 },
};

describe('buildDefaultTrialSubscription', () => {
  it('Dado o plano Trial padrão, quando provisiona, então retorna assinatura com limite e expiração canônicos', () => {
    const now = new Date('2026-11-07T12:00:00Z');
    expect(buildDefaultTrialSubscription('tenant-1', plan, now)).toEqual({
      tenantId: 'tenant-1', planId: 'plan-trial', status: 'trial',
      trialEndsAt: new Date('2026-11-14T12:00:00Z'), creativesRemaining: 5,
    });
  });

  it('Dado contrato Trial divergente em qualquer termo, quando provisiona, então rejeita a configuração', () => {
    const invalidPlans = [
      { ...plan, features: { ...plan.features, trialDays: 14 } },
      { ...plan, features: { ...plan.features, images: 4 } },
      { ...plan, features: { ...plan.features, revisionsPerImage: 2 } },
      { ...plan, features: { ...plan.features, videos: true } },
      { ...plan, limits: { ...plan.limits, creativesPerMonth: 4 } },
      { ...plan, limits: { ...plan.limits, modificationsPerCreative: 2 } },
      { ...plan, limits: { ...plan.limits, videosPerMonth: 1 } },
      { ...plan, priceCents: 100 },
      { ...plan, isActive: false },
    ];

    for (const invalidPlan of invalidPlans) {
      expect(() => buildDefaultTrialSubscription('tenant-1', invalidPlan, new Date())).toThrow();
    }
  });
});
