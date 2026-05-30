import { useSubscription } from '@/hooks/useBilling';
import type { SubscriptionStatus } from '@/types/billing';

const BADGE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  active_starter: { label: 'STARTER', bg: 'bg-indigo-500/20', text: 'text-indigo-300' },
  active_pro: { label: 'PRO', bg: 'bg-[#EA580C]/20', text: 'text-[#EA580C]' },
  active_enterprise: { label: 'ENTERPRISE', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  trial: { label: 'TRIAL', bg: 'bg-warning/20', text: 'text-warning' },
  past_due: { label: 'ATRASADO', bg: 'bg-error/20', text: 'text-error' },
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
        className={`mx-auto flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-black ${config.bg} ${config.text}`}
        title={config.label}
      >
        {config.label[0]}
      </div>
    );
  }

  return (
    <div className={`mx-3 rounded-lg px-3 py-1.5 ${config.bg}`}>
      <p className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5">Plano atual</p>
      <p className={`text-xs font-black tracking-wider ${config.text}`}>{config.label}</p>
    </div>
  );
}
