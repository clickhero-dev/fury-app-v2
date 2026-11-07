import { AppError } from '../middleware/errorHandler.js';

type DefaultTrialPlan = {
  id: string;
  isActive: boolean;
  priceCents: number;
  features: unknown;
  limits: unknown;
};

type TrialFeatures = { trialDays?: unknown; images?: unknown; revisionsPerImage?: unknown; videos?: unknown };
type TrialLimits = { creativesPerMonth?: unknown; modificationsPerCreative?: unknown; videosPerMonth?: unknown };

/** Single contract for automatic and public Trial provisioning. */
export function buildDefaultTrialSubscription(tenantId: string, plan: DefaultTrialPlan | null, now: Date = new Date()) {
  const features = plan?.features as TrialFeatures | null | undefined;
  const limits = plan?.limits as TrialLimits | null | undefined;
  const isCanonicalTrial = plan?.isActive === true
    && plan.priceCents === 0
    && features?.trialDays === 7
    && features.images === 5
    && features.revisionsPerImage === 3
    && features.videos === false
    && limits?.creativesPerMonth === 5
    && limits.modificationsPerCreative === 3
    && limits.videosPerMonth === 0;
  if (!plan || !isCanonicalTrial) {
    throw new AppError(503, 'TRIAL_PLAN_UNAVAILABLE', 'O plano Trial não está disponível ou tem configuração inválida.');
  }

  return {
    tenantId,
    planId: plan.id,
    status: 'trial' as const,
    trialEndsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    creativesRemaining: 5,
  };
}
