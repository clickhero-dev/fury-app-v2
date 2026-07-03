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

/**
 * Card de métrica para exibição de KPIs no Dashboard.
 *
 * Exibe um valor principal em destaque com badge de variação percentual colorido:
 * - Verde com seta para cima → variação positiva
 * - Vermelho com seta para baixo → variação negativa
 * - Cinza → sem variação (change = 0)
 *
 * @example
 * <MetricCard
 *   label="ROAS"
 *   value="4.2x"
 *   change={12}
 *   changeLabel="vs. mês anterior"
 *   icon={<TrendingUp />}
 * />
 */
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
    <div className="bg-surface rounded-xl border border-border p-6 space-y-4 hover:shadow-lg transition-shadow">
      {/* Cabeçalho com label e ícone */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-secondary">{label}</p>
        {icon && <div className="text-accent">{icon}</div>}
      </div>

      {/* Valor principal e badge de variação */}
      <div className="space-y-2">
        <div className="text-4xl font-black text-text-primary">{value}</div>

        {change !== undefined && (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg',
                isPositive && 'bg-success-light text-success',
                isNegative && 'bg-error-light text-error',
                !isPositive && !isNegative && 'bg-border text-text-tertiary'
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
              <span className="text-xs text-text-secondary">{changeLabel}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}