import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

export function MetricCard({
  label,
  value,
  change,
  changeLabel,
  icon,
  trend = 'neutral',
}: MetricCardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0E0] p-6 space-y-4 hover:shadow-lg transition-shadow">
      {/* Header with icon and label */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#6E7681]">{label}</p>
        {icon && <div className="text-[#E8631A]">{icon}</div>}
      </div>

      {/* Main value */}
      <div className="space-y-2">
        <div className="text-4xl font-black text-[#1C1C1E]">{value}</div>

        {/* Change badge */}
        {change !== undefined && (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg',
                isPositive && 'bg-[#2EA043]/10 text-[#2EA043]',
                isNegative && 'bg-[#DA3633]/10 text-[#DA3633]',
                !isPositive && !isNegative && 'bg-[#6E7681]/10 text-[#6E7681]'
              )}
            >
              {isPositive && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414-1.414L13.586 7H12z" clipRule="evenodd" />
                </svg>
              )}
              {isNegative && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 13a1 1 0 110 2H7a1 1 0 01-1-1V9a1 1 0 112 0v3.586l4.293-4.293a1 1 0 011.414 1.414L8.414 13H12z" clipRule="evenodd" />
                </svg>
              )}
              <span>{Math.abs(change)}%</span>
            </span>
            {changeLabel && (
              <span className="text-xs text-[#6E7681]">{changeLabel}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
