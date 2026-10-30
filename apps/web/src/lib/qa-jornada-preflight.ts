export type QaSubscription = {
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'inactive';
  isNonExpirable?: boolean;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
};

export type QaPreflightInput = {
  subscription?: QaSubscription | null;
  metaConnections?: Array<{ id: string; selectedAdAccountId: string | null }>;
  metaPages?: Array<{ pageId: string; hasWhatsApp: boolean }>;
  quota?: { creativesRemaining: number | null; creativesLimit: number | null };
};

export type QaPreflightResult = { ok: true } | { ok: false; code: string; message: string };

export type QaPreflightResponseStatuses = {
  subscription: number;
  connections: number;
  assetSelection: number;
  quota: number;
};

export function describePreflightResponseFailures(statuses: QaPreflightResponseStatuses): string | null {
  const failures = Object.entries(statuses)
    .filter(([, status]) => status < 200 || status >= 300)
    .map(([name, status]) => `${name}(${status})`);
  return failures.length > 0 ? `PREFLIGHT_UNKNOWN: endpoints indisponíveis: ${failures.join(', ')}.` : null;
}

const UNKNOWN: QaPreflightResult = {
  ok: false,
  code: 'PREFLIGHT_UNKNOWN',
  message: 'Pré-condições da conta QA não puderam ser verificadas.',
};

function isValidDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function subscriptionIsEligible(subscription: QaSubscription): boolean | null {
  if (!['active', 'trial'].includes(subscription.status)) return false;
  if (subscription.isNonExpirable) return true;

  const expiration = subscription.status === 'trial' ? subscription.trialEndsAt : subscription.currentPeriodEnd;
  if (!isValidDate(expiration)) return null;
  return Date.now() < new Date(expiration).getTime();
}

export function evaluateQaPreflight(input: QaPreflightInput): QaPreflightResult {
  if (
    input.subscription === undefined ||
    input.metaConnections === undefined ||
    input.metaPages === undefined ||
    input.quota === undefined
  ) {
    return UNKNOWN;
  }

  const subscriptionEligible = input.subscription === null ? false : subscriptionIsEligible(input.subscription);
  if (subscriptionEligible === null) return UNKNOWN;
  if (!subscriptionEligible) {
    return {
      ok: false,
      code: 'SUBSCRIPTION_INELIGIBLE',
      message: 'A conta QA não possui assinatura ou trial elegível.',
    };
  }

  if (input.metaConnections.length === 0) {
    return { ok: false, code: 'META_NOT_READY', message: 'A conta QA não possui conexão Meta.' };
  }
  if (!input.metaConnections.some((connection) => connection.id && connection.selectedAdAccountId)) {
    return { ok: false, code: 'META_NOT_READY', message: 'A conta QA não possui conta de anúncios selecionada.' };
  }
  if (input.metaPages.length === 0 || !input.metaPages.some((page) => page.pageId)) {
    return { ok: false, code: 'META_NOT_READY', message: 'A conta QA não possui Página Meta disponível.' };
  }

  const { creativesRemaining } = input.quota;
  if (creativesRemaining !== null && (!Number.isInteger(creativesRemaining) || creativesRemaining < 0)) {
    return UNKNOWN;
  }
  if (creativesRemaining === 0) {
    return {
      ok: false,
      code: 'IMAGE_QUOTA_EXHAUSTED',
      message: 'A conta QA não possui cota de imagem suficiente.',
    };
  }

  return { ok: true };
}
