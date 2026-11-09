/*
# Language: pt-BR

Funcionalidade: plano não expirável da conta demo

  Cenário: assinatura demo não expira mesmo com período vencido
    Dado uma assinatura ativa marcada como não expirável
    Quando passa pela guarda de assinatura
    Então a navegação é liberada
*/
import { describe, expect, it, vi } from 'vitest';

const findSubscription = vi.fn();
vi.mock('../repository/subscription.repository.js', () => ({
  SubscriptionRepository: class { findSubscription = findSubscription; },
}));
vi.mock('../services/core/rbac.service.js', () => ({ rbacService: { getPlatformRole: vi.fn() } }));

import { checkSubscriptionActive } from './checkSubscriptionActive.js';

describe('BDD: checkSubscriptionActive para demo', () => {
  it('Cenário: assinatura demo não expira mesmo com período vencido', async () => {
    findSubscription.mockResolvedValue({ status: 'active', isNonExpirable: true, currentPeriodEnd: new Date('2000-01-01') });
    const next = vi.fn();
    checkSubscriptionActive({ user: { userId: 'demo-user', role: 'demo', tenantId: 'demo' }, tenant: { tenantId: 'demo' } } as never, {} as never, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith());
  });

  it('Cenário: plano demo continua liberado mesmo com status inativo', async () => {
    findSubscription.mockResolvedValue({ status: 'inactive', isNonExpirable: true, trialEndsAt: new Date(0), currentPeriodEnd: new Date(0) });
    const next = vi.fn();
    checkSubscriptionActive({ user: { userId: 'demo-user', role: 'demo', tenantId: 'demo' }, tenant: { tenantId: 'demo' } } as never, {} as never, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith());
  });
});
