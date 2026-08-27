import { describe, expect, it } from 'vitest';
import {
  computeSubscriptionState,
  isPlanExpiredFromDate,
  shouldRedirectToExpired,
} from './subscriptionGuard';
import type { Subscription } from '../../types/billing';

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const past = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  return {
    id: 's1',
    tenantId: 't1',
    planId: 'p1',
    status: 'active',
    isNonExpirable: false,
    trialEndsAt: null,
    currentPeriodEnd: future,
    createdAt: past,
    updatedAt: past,
    plan: null,
    invoices: [],
    ...overrides,
  };
}

describe('isPlanExpiredFromDate', () => {
  it('retorna null quando não há data de expiração', () => {
    expect(isPlanExpiredFromDate(null)).toBeNull();
    expect(isPlanExpiredFromDate(undefined)).toBeNull();
    expect(isPlanExpiredFromDate('')).toBeNull();
  });

  it('retorna null para datas inválidas', () => {
    expect(isPlanExpiredFromDate('not-a-date')).toBeNull();
  });

  it('retorna false para data futura (assinatura válida)', () => {
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    expect(isPlanExpiredFromDate(future)).toBe(false);
  });

  it('retorna true para data passada (assinatura vencida)', () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    expect(isPlanExpiredFromDate(past)).toBe(true);
  });
});

describe('computeSubscriptionState', () => {
  it('retorna "none" quando não existe assinatura (inclui falha de API que retorna null)', () => {
    expect(computeSubscriptionState(null)).toBe('none');
    expect(computeSubscriptionState(undefined)).toBe('none');
  });

  it('retorna "expired" para assinatura pagante com período vencido', () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    expect(computeSubscriptionState(makeSub({ status: 'active', currentPeriodEnd: past }))).toBe(
      'expired'
    );
  });

  it('retorna "expired" para trial vencido', () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    expect(computeSubscriptionState(makeSub({ status: 'trial', trialEndsAt: past }))).toBe(
      'expired'
    );
  });

  it('retorna "expired" para status cancelled/inactive/past_due', () => {
    expect(computeSubscriptionState(makeSub({ status: 'cancelled' }))).toBe('expired');
    expect(computeSubscriptionState(makeSub({ status: 'past_due' }))).toBe('expired');
    expect(
      computeSubscriptionState(
        makeSub({ status: 'inactive', isNonExpirable: true, currentPeriodEnd: null })
      )
    ).toBe('expired');
  });

  it('retorna "active" para assinatura ativa em período válido', () => {
    expect(computeSubscriptionState(makeSub({ status: 'active' }))).toBe('active');
  });

  it('retorna "active" para assinatura não expirável ativa', () => {
    expect(
      computeSubscriptionState(makeSub({ status: 'trial', isNonExpirable: true, trialEndsAt: null }))
    ).toBe('active');
  });

  it('retorna "expired" para assinatura ativa sem período definido, mas tratada como ativa quando status é trial futuro', () => {
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    expect(computeSubscriptionState(makeSub({ status: 'trial', trialEndsAt: future }))).toBe(
      'active'
    );
  });
});

describe('shouldRedirectToExpired', () => {
  it('NUNCA redireciona usuário com assinatura válida persistida no Redux quando a API falha (bug 500)', () => {
    // A chamada atual retornou null/erro (500) → estado "none", mas o Redux persistido diz data futura.
    expect(
      shouldRedirectToExpired({
        subscriptionChecked: true, // fetch resolveu (retornou null = erro mascarado)
        state: 'none',
        reduxPlanExpired: false, // persistido: ainda válido
      })
    ).toBe(false);
  });

  it('redireciona quando o Redux persistido confirma expiração', () => {
    expect(
      shouldRedirectToExpired({
        subscriptionChecked: false,
        state: 'none',
        reduxPlanExpired: true,
      })
    ).toBe(true);
  });

  it('redireciona sem plano na primeira sessão (sem valor persistido)', () => {
    expect(
      shouldRedirectToExpired({
        subscriptionChecked: true,
        state: 'none',
        reduxPlanExpired: null,
      })
    ).toBe(true);
  });

  it('redireciona quando a API confirma expiração e não há conflito persistido', () => {
    expect(
      shouldRedirectToExpired({
        subscriptionChecked: true,
        state: 'expired',
        reduxPlanExpired: null,
      })
    ).toBe(true);
  });

  it('NÃO redireciona quando a API diz expirado mas o Redux persistido ainda é válido', () => {
    expect(
      shouldRedirectToExpired({
        subscriptionChecked: true,
        state: 'expired',
        reduxPlanExpired: false,
      })
    ).toBe(false);
  });

  it('nunca redireciona assinatura ativa', () => {
    expect(
      shouldRedirectToExpired({
        subscriptionChecked: true,
        state: 'active',
        reduxPlanExpired: null,
      })
    ).toBe(false);
  });

  it('não redireciona enquanto o fetch ainda está carregando', () => {
    expect(
      shouldRedirectToExpired({
        subscriptionChecked: false,
        state: 'none',
        reduxPlanExpired: null,
      })
    ).toBe(false);
  });
});