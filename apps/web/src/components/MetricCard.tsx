import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  /** Label descritivo da métrica (ex: "ROAS", "CPA Médio"). */
  label: string;
  /** Valor principal exibido em destaque (ex: "4.2x", "R$ 38,00"). */
  value: string | number;
  /** Variação percentual em relação ao período anterior. Positivo = alta, negativo = baixa. */
  change?: number;
  /** Texto complementar ao badge de variação (ex: "vs. mês anterior"). */
  changeLabel?: string;
  /** Ícone exibido no canto superior direito do card. */
  icon?: ReactNode;
  /** Direção da tendência — atualmente não utilizado na renderização. */
  trend?: 'up' | 'down' | 'neutral';
}

export function MetricCard({
  label,
  value,
  change,
  changeLabel,
  icon,
}: MetricCardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <div className="bg-white dark:bg-[#12130F] rounded-2xl border border-slate-200 dark:border-white/10 p-6 space-y-4 hover:shadow-md transition-shadow">
      {/* Cabeçalho com label e ícone */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">{label}</p>
        {icon && <div className="text-[#1E88A8]">{icon}</div>}
      </div>

      {/* Valor principal e badge de variação */}
      <div className="space-y-2">
        <div className="text-4xl font-black text-slate-900 dark:text-white">{value}</div>

        {change !== undefined && (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full',
                isPositive && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                isNegative && 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                !isPositive && !isNegative && 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
              )}
            >
              {isPositive && (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414-1.414L13.586 7H12z" clipRule="evenodd" />
                </svg>
              )}
              {isNegative && (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 13a1 1 0 110 2H7a1 1 0 01-1-1V9a1 1 0 112 0v3.586l4.293-4.293a1 1 0 011.414 1.414L8.414 13H12z" clipRule="evenodd" />
                </svg>
              )}
              <span>{Math.abs(change)}%</span>
            </span>
            {changeLabel && (
              <span className="text-xs text-slate-500 dark:text-zinc-400">{changeLabel}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}