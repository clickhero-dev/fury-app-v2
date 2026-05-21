import { Zap, TrendingUp, PauseCircle, Users, RefreshCw, PieChart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsightCardProps {
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expectedImpact?: string;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  budget_adjustment: TrendingUp,
  budget_optimization: PieChart,
  campaign_pause: PauseCircle,
  audience_expansion: Users,
  creative_refresh: RefreshCw,
};

const PRIORITY_CONFIG = {
  high: {
    label: 'Alta prioridade',
    dotClass: 'bg-error',
    borderStyle: { borderLeftColor: 'var(--color-error)' },
    badgeClass: 'bg-error-light text-error',
  },
  medium: {
    label: 'Média prioridade',
    dotClass: 'bg-warning',
    borderStyle: { borderLeftColor: 'var(--color-warning)' },
    badgeClass: 'bg-warning-light text-warning',
  },
  low: {
    label: 'Baixa prioridade',
    dotClass: 'bg-border',
    borderStyle: { borderLeftColor: 'var(--color-border)' },
    badgeClass: 'bg-surface-secondary text-text-secondary',
  },
};

export function InsightCard({ type, priority, title, description, expectedImpact }: InsightCardProps) {
  const Icon = TYPE_ICONS[type] ?? Zap;
  const config = PRIORITY_CONFIG[priority];

  return (
    <div
      className="bg-surface rounded-xl border border-border border-l-4 p-5 space-y-3 hover:shadow-md transition-shadow"
      style={config.borderStyle}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#FEF0E7] flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-accent" />
          </div>
          <h4 className="text-sm font-semibold text-text-primary leading-snug">{title}</h4>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0', config.badgeClass)}>
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', config.dotClass)} />
          {config.label}
        </span>
      </div>

      <p className="text-sm text-text-secondary leading-relaxed pl-12">{description}</p>

      {expectedImpact && (
        <div className="pl-12">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-[#FEF0E7] px-3 py-1 rounded-lg">
            <Zap className="w-3 h-3" />
            {expectedImpact}
          </div>
        </div>
      )}
    </div>
  );
}
