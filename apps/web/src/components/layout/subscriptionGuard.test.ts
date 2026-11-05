import { describe, expect, it } from 'vitest';
import {
  computeSubscriptionState,
  getSubscriptionExpiration,
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
  /* Funcionalidade: vencimento independente da marcação não expirável
   * Cenário: assinatura com período vencido
   * Dado que o plano tem data passada e está marcado como não expirável
   * Quando o acesso é verificado
   * Então a assinatura é considerada vencida.
   */
  it('considera vencida assinatura marcada não expirável com período passado', () => {
    expect(computeSubscriptionState(makeSub({ isNonExpirable: true, currentPeriodEnd: '2020-01-01T00:00:00Z' }))).toBe('expired');
  });

  it('considera vencido trial marcado não expirável com data passada', () => {
    expect(computeSubscriptionState(makeSub({ status: 'trial', isNonExpirable: true, trialEndsAt: '2020-01-01T00:00:00Z' }))).toBe('expired');
  });

  it('considera past_due vencido mesmo com marcação não expirável', () => {
    expect(computeSubscriptionState(makeSub({ status: 'past_due', isNonExpirable: true }))).toBe('expired');
  });
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

describe('data de vencimento persistida', () => {
  /* Funcionalidade: preservar a data correta quando a consulta falhar
   * Cenário: assinatura ativa após o trial
   * Dado que o trial terminou e o período pago está válido
   * Quando a assinatura é atualizada
   * Então a data salva é a do período pago.
   */
  it('usa o período pago para assinatura ativa após trial', () => {
    const sub = makeSub({ trialEndsAt: '2020-01-01T00:00:00Z' });
    expect(getSubscriptionExpiration(sub)).toBe(sub.currentPeriodEnd);
  });
  it('salva vencimento mesmo para assinatura marcada não expirável', () => {
    const sub = makeSub({ isNonExpirable: true });
    expect(getSubscriptionExpiration(sub)).toBe(sub.currentPeriodEnd);
  });
  it('usa o fim do trial e aceita ausência de assinatura', () => {
    const sub = makeSub({ status: 'trial', trialEndsAt: '2099-01-01T00:00:00Z' });
    expect(getSubscriptionExpiration(sub)).toBe(sub.trialEndsAt);
    expect(getSubscriptionExpiration(null)).toBeNull();
  });
});

describe('shouldRedirectToExpired', () => {
  /*
   * Funcionalidade: recuperação de acesso após renovação
   * Cenário: data antiga vencida na sessão, mas consulta confirma assinatura ativa
   * Dado que a pessoa renovou e sua sessão ainda guarda uma data vencida
   * Quando acessa o dashboard após a confirmação atual da assinatura
   * Então não deve voltar à tela de assinatura vencida.
   */
  it('permite acesso quando consulta confirma assinatura ativa apesar de data antiga vencida', () => {
    expect(shouldRedirectToExpired({ subscriptionChecked: true, state: 'active', reduxPlanExpired: true })).toBe(false);
  });
  it('mantém bloqueio durante a espera quando a data persistida está vencida', () => {
    expect(shouldRedirectToExpired({ subscriptionChecked: false, state: 'active', reduxPlanExpired: true })).toBe(true);
  });
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

  it('redireciona quando a API confirma vencimento mesmo com data antiga válida', () => {
    expect(
      shouldRedirectToExpired({
        subscriptionChecked: true,
        state: 'expired',
        reduxPlanExpired: false,
      })
    ).toBe(true);
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