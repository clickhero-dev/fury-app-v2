import { useSubscription } from '@/hooks/useBilling';
import type { SubscriptionStatus } from '@/types/billing';

const BADGE_CONFIG: Record<string, { label: string }> = {
  active_starter: { label: 'STARTER' },
  active_pro: { label: 'PRO' },
  active_enterprise: { label: 'ENTERPRISE' },
  trial: { label: 'TRIAL' },
  past_due: { label: 'ATRASADO' },
};

function getPlanKey(planName: string, status: SubscriptionStatus): string {
  if (status === 'trial') return 'trial';
  if (status === 'past_due') return 'past_due';
  const lower = planName.toLowerCase();
  if (lower.includes('enterprise')) return 'active_enterprise';
  if (lower.includes('pro')) return 'active_pro';
  return 'active_starter';
}

interface PlanBadgeProps {
  collapsed?: boolean;
}

export function PlanBadge({ collapsed }: PlanBadgeProps) {
  const { data: subscription, isLoading } = useSubscription();

  if (isLoading || !subscription || subscription.status === 'cancelled' || subscription.status === 'inactive') {
    return null;
  }

  const key = getPlanKey(subscription.plan?.name ?? '', subscription.status);
  const config = BADGE_CONFIG[key];
  if (!config) return null;

  if (collapsed) {
    return (
      <div
        className="mx-auto flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-black bg-white/10 text-white"
        title={config.label}
      >
        {config.label[0]}
      </div>
    );
  }

  return (
    <div className="mx-3 rounded-lg px-3 py-1.5 bg-black/30 border border-white/20">
      <p className="text-[10px] text-white/70 uppercase tracking-widest mb-0.5">Plano atual</p>
      <p className="text-xs font-bold tracking-wider text-white">{config.label}</p>
    </div>
  );
}
