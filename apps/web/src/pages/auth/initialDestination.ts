import type { Subscription } from '@/types/billing';

/** Escolhe apenas o destino padrão; os gates de acesso continuam no shell. */
export function initialDestination(subscription: Pick<Subscription, 'status' | 'trialEndsAt'> | null): '/chat' | '/dashboard' {
  if (subscription?.status !== 'trial') return '/dashboard';
  if (subscription.trialEndsAt !== null) {
    const end = Date.parse(subscription.trialEndsAt);
    if (!Number.isFinite(end) || end <= Date.now()) return '/dashboard';
  }
  return '/chat';
}
