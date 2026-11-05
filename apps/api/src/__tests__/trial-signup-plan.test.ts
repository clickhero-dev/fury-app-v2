/*
Funcionalidade: provisionar Trial no cadastro de um tenant novo
Cenário: existe um único plano Trial ativo
  Dado que o catálogo possui trial_new_signup ativo
  Quando o tenant novo for provisionado
  Então uma assinatura trial de 7 dias e quota 5 será criada sem identificador Asaas

Cenário: o plano Trial não existe ou é inválido
  Dado que o catálogo não possui Trial válido
  Quando o tenant novo for provisionado
  Então a operação falhará sem criar uma assinatura
*/
import { describe, expect, it, vi } from 'vitest';
import { provisionTrialSubscription, isTrialExpired } from '../services/billing/trial-signup.js';

const plan = { id: 'plan-trial', technicalKey: 'trial_new_signup', priceCents: 0, isActive: true, limits: { creativesPerMonth: 5 } };

describe('provisionTrialSubscription', () => {
  it('cria uma assinatura Trial única, com quota e sem Asaas', async () => {
    const tx = {
      queryPlan: vi.fn().mockResolvedValue(plan),
      querySubscription: vi.fn().mockResolvedValue(null),
      insertSubscription: vi.fn().mockResolvedValue({ id: 'sub-1' }),
    };
    const start = new Date('2026-10-30T12:00:00.000Z');

    await expect(provisionTrialSubscription(tx, 'tenant-1', start)).resolves.toEqual({ id: 'sub-1' });
    expect(tx.insertSubscription).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', planId: 'plan-trial', status: 'trial',
      creativesRemaining: 5, asaasSubscriptionId: null, asaasCustomerId: null,
      trialEndsAt: new Date('2026-11-06T12:00:00.000Z'),
      currentPeriodEnd: new Date('2026-11-06T12:00:00.000Z'),
    }));
  });

  it('não duplica uma concessão existente', async () => {
    const tx = { queryPlan: vi.fn().mockResolvedValue(plan), querySubscription: vi.fn().mockResolvedValue({ id: 'existing' }), insertSubscription: vi.fn() };
    await expect(provisionTrialSubscription(tx, 'tenant-1', new Date())).resolves.toEqual({ id: 'existing' });
    expect(tx.insertSubscription).not.toHaveBeenCalled();
  });

  it('considera o instante exato do vencimento expirado', () => {
    const endsAt = new Date('2026-11-06T12:00:00.000Z');
    expect(isTrialExpired(new Date('2026-11-06T11:59:59.999Z'), endsAt)).toBe(false);
    expect(isTrialExpired(endsAt, endsAt)).toBe(true);
  });
});
