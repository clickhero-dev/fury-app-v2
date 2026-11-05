import { AppError } from '../../middleware/errorHandler.js';

export const TRIAL_PLAN_KEY = 'trial_new_signup' as const;
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function isTrialExpired(now: Date, trialEndsAt: Date | null | undefined): boolean {
  return trialEndsAt !== null && trialEndsAt !== undefined && now.getTime() >= trialEndsAt.getTime();
}

export type TrialPlanValidation =
  | { ok: true }
  | { ok: false; reason: 'INVALID_TRIAL_PLAN' };

export function validateTrialPlan(input: {
  technicalKey: string | null | undefined;
  priceCents: number;
  isActive: boolean;
  creativesPerMonth: number | null | undefined;
}): TrialPlanValidation {
  if (
    input.technicalKey !== TRIAL_PLAN_KEY ||
    input.priceCents !== 0 ||
    !input.isActive ||
    input.creativesPerMonth !== 5
  ) {
    return { ok: false, reason: 'INVALID_TRIAL_PLAN' };
  }
  return { ok: true };
}

export function buildTrialWindow(start: Date): { trialEndsAt: Date; currentPeriodEnd: Date } {
  const end = new Date(start.getTime() + TRIAL_DURATION_MS);
  return { trialEndsAt: end, currentPeriodEnd: new Date(end) };
}

export function assertValidTrialPlan(input: Parameters<typeof validateTrialPlan>[0]): void {
  const validation = validateTrialPlan(input);
  if (!validation.ok) {
    throw new AppError(503, validation.reason, 'O plano de teste não está disponível.');
  }
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

export async function provisionTrialSubscription(
  tx: TrialTransaction,
  tenantId: string,
  startedAt: Date,
): Promise<{ id: string }> {
  const plan = await tx.queryPlan(TRIAL_PLAN_KEY);
  const limits = (plan?.limits ?? {}) as { creativesPerMonth?: number | null };
  if (!plan || !validateTrialPlan({
    technicalKey: plan.technicalKey,
    priceCents: plan.priceCents,
    isActive: plan.isActive,
    creativesPerMonth: limits.creativesPerMonth,
  }).ok) {
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
    creativesRemaining: 5,
    asaasSubscriptionId: null,
    asaasCustomerId: null,
  });
}
