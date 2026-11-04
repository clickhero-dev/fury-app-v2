import { AppError } from '../../middleware/errorHandler.js';

export const TRIAL_PLAN_KEY = 'trial_new_signup' as const;
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const TRIAL_CREATIVES_LIMIT = 5;

export function isTrialExpired(now: Date, trialEndsAt: Date | null | undefined): boolean {
  return trialEndsAt !== null && trialEndsAt !== undefined && now.getTime() >= trialEndsAt.getTime();
}

export function buildTrialWindow(start: Date): { trialEndsAt: Date; currentPeriodEnd: Date } {
  const end = new Date(start.getTime() + TRIAL_DURATION_MS);
  return { trialEndsAt: end, currentPeriodEnd: new Date(end) };
}

type TrialTransaction = {
  queryPlan: (technicalKey: string) => Promise<{
    id: string;
    technicalKey: string | null;
    priceCents: number;
    isActive: boolean;
    limits: unknown;
  } | null>;
  querySubscription: (tenantId: string) => Promise<{ id: string } | null>;
  insertSubscription: (values: Record<string, unknown>) => Promise<{ id: string }>;
};

function isValidTrialPlan(plan: Awaited<ReturnType<TrialTransaction['queryPlan']>>): boolean {
  const limits = (plan?.limits ?? {}) as { creativesPerMonth?: number | null };
  return plan?.technicalKey === TRIAL_PLAN_KEY
    && plan.priceCents === 0
    && plan.isActive
    && limits.creativesPerMonth === TRIAL_CREATIVES_LIMIT;
}

export async function provisionTrialSubscription(
  tx: TrialTransaction,
  tenantId: string,
  startedAt: Date,
): Promise<{ id: string }> {
  const plan = await tx.queryPlan(TRIAL_PLAN_KEY);
  if (!plan || !isValidTrialPlan(plan)) {
    throw new AppError(503, 'INVALID_TRIAL_PLAN', 'O plano de teste não está disponível.');
  }

  const existing = await tx.querySubscription(tenantId);
  if (existing) return existing;

  const { trialEndsAt, currentPeriodEnd } = buildTrialWindow(startedAt);
  return tx.insertSubscription({
    tenantId,
    planId: plan.id,
    status: 'trial',
    trialEndsAt,
    currentPeriodEnd,
    creativesRemaining: TRIAL_CREATIVES_LIMIT,
    asaasSubscriptionId: null,
    asaasCustomerId: null,
  });
}
