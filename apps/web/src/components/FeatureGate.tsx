import { useSubscription } from '@/hooks/useBilling';

const FEATURE_REQUIRED_LEVEL: Record<string, number> = {
  campaigns_unlimited: 1,
  automation: 1,
  ai_studio: 1,
  advanced_reports: 1,
  api_integrations: 1,
  multi_accounts: 2,
  custom_integrations: 2,
  dedicated_manager: 2,
  priority_support: 2,
};

const PLAN_LEVEL: Record<string, number> = {
  starter: 0,
  pro: 1,
  enterprise: 2,
};

const REQUIRED_PLAN_NAME: Record<number, string> = {
  1: 'Pro',
  2: 'Enterprise',
};

function getPlanLevel(planName: string | undefined | null): number {
  if (!planName) return 0;
  const lower = planName.toLowerCase();
  if (lower.includes('enterprise')) return PLAN_LEVEL.enterprise;
  if (lower.includes('pro')) return PLAN_LEVEL.pro;
  return PLAN_LEVEL.starter;
}

interface FeatureGateProps {
  featureName: string;
  children: React.ReactNode;
  className?: string;
}

export function FeatureGate({ featureName, children, className }: FeatureGateProps) {
  const { data: subscription } = useSubscription();

  const requiredLevel = FEATURE_REQUIRED_LEVEL[featureName] ?? 0;
  const currentLevel = getPlanLevel(subscription?.plan?.name);
  const hasAccess = currentLevel >= requiredLevel;

  if (hasAccess) {
    return <>{children}</>;
  }

  const requiredPlan = REQUIRED_PLAN_NAME[requiredLevel] ?? 'Pro';

  return (
    <div className={`relative group ${className ?? ''}`}>
      <div className="pointer-events-none select-none opacity-40">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center cursor-not-allowed rounded-lg">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div className="bg-[#1c1c1e] text-white text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap font-medium border border-white/10">
            Disponível no plano{' '}
            <span className="text-[#EA580C] font-bold">{requiredPlan}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
