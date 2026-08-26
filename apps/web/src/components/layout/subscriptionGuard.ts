import type { Subscription } from '../../types/billing';

/** Estado de assinatura derivado. `'none'` = sem assinatura (ou fetch retornou null/erro). */
export type SubscriptionState = 'expired' | 'active' | 'none';

/**
 * Deriva o estado de expiração a partir da assinatura retornada pela API.
 * `null`/`undefined` de uma falha de API é tratado como 'none' — não como prova de vencimento.
 */
export function computeSubscriptionState(
  subscription: Subscription | null | undefined
): SubscriptionState {
  if (!subscription) return 'none';

  if (subscription.isNonExpirable) {
    return ['cancelled', 'inactive'].includes(subscription.status) ? 'expired' : 'active';
  }

  const now = Date.now();

  if (['cancelled', 'inactive', 'past_due'].includes(subscription.status)) return 'expired';
  if (
    subscription.status === 'trial' &&
    subscription.trialEndsAt &&
    now >= new Date(subscription.trialEndsAt).getTime()
  ) {
    return 'expired';
  }
  if (
    subscription.status === 'active' &&
    subscription.currentPeriodEnd &&
    now >= new Date(subscription.currentPeriodEnd).getTime()
  ) {
    return 'expired';
  }

  return 'active';
}

/**
 * Avalia uma data de expiração persistida.
 * Retorna `true` (vencida), `false` (válida) ou `null` (desconhecido — sem data válida).
 */
export function isPlanExpiredFromDate(planExpiration: string | null | undefined): boolean | null {
  if (!planExpiration) return null;
  const exp = new Date(planExpiration).getTime();
  if (Number.isNaN(exp)) return null;
  return Date.now() >= exp;
}

export interface RedirectDecision {
  /** true quando o fetch de assinatura já resolveu (subFetched). */
  subscriptionChecked: boolean;
  /** estado derivado da API via computeSubscriptionState. */
  state: SubscriptionState;
  /** valor persistido no Redux via selectIsPlanExpired (true=vencida, false=válida, null=desconhecido). */
  reduxPlanExpired: boolean | null;
}

/**
 * Decide se redireciona para `/assinatura-vencida`.
 *
 * Garantia anti-falso-positivo: um `null`/`'none'` vindo de um erro/sucesso vazio de API
 * NUNCA sobrescreve um `planExpiration` persistido no Redux que ainda aponta data futura
 * (reduxPlanExpired === false). Assim, uma falha (500 etc) não derruba dono de assinatura válida.
 */
export function shouldRedirectToExpired({
  subscriptionChecked,
  state,
  reduxPlanExpired,
}: RedirectDecision): boolean {
  if (reduxPlanExpired === true) return true; // Redux persistido confirma expiração.
  if (state === 'active') return false; // assinatura ativa → nunca redireciona.
  if (!subscriptionChecked) return false; // fetch ainda carregando → aguarda.

  // Sem plano ou expirado pela API → redireciona, exceto se o Redux persistido ainda diz data futura.
  return reduxPlanExpired !== false;
}