import { cn } from '@/lib/utils';
import type { WizardBudgetState } from '../types';

interface Step4BudgetProps {
  value: WizardBudgetState;
  onChange: (updates: Partial<WizardBudgetState>) => void;
}

const BUDGET_SUGGESTIONS = [7, 15, 30, 50, 100];

const DURATION_SUGGESTIONS: { days: number; description: string }[] = [
  { days: 7, description: 'Ideal para testar rapidamente o desempenho do anúncio.' },
  { days: 14, description: 'Bom equilíbrio entre tempo de aprendizado e resultados.' },
  { days: 30, description: 'Recomendado para campanhas contínuas e maior alcance.' },
];

export function Step4Budget({ value, onChange }: Step4BudgetProps) {
  const hasDuration = value.durationDays !== undefined;
  const total = hasDuration ? value.dailyBudgetBrl * (value.durationDays ?? 0) : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-text-primary">Quanto vai investir?</h3>
        <p className="text-sm text-text-secondary mt-1">Defina o valor diário do investimento na campanha.</p>
      </div>

      <div>
        <label className="text-sm font-bold text-text-primary mb-1 block">Investimento diário</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary font-medium">R$</span>
          <input
            type="number"
            min={7}
            step={1}
            value={value.dailyBudgetBrl}
            onChange={(e) => onChange({ dailyBudgetBrl: Number(e.target.value) })}
            className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-surface text-text-primary transition-all duration-200 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        {value.dailyBudgetBrl < 7 && (
          <p className="text-sm text-error mt-1">O investimento mínimo é de R$ 7,00/dia (equivalente a US$ 1,00 + 30%).</p>
        )}

        <div className="flex gap-2 mt-3">
          {BUDGET_SUGGESTIONS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => onChange({ dailyBudgetBrl: amount })}
              className={cn(
                'px-4 py-2 rounded-lg border-2 text-sm font-bold transition-all',
                value.dailyBudgetBrl === amount
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-border text-text-secondary hover:border-brand/40'
              )}
            >
              R${amount}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border/60 pt-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={hasDuration}
            onClick={() => onChange({ durationDays: hasDuration ? undefined : 7 })}
            className={cn(
              'w-11 h-6 rounded-full transition-colors relative flex-shrink-0',
              hasDuration ? 'bg-brand' : 'bg-border'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 bg-surface rounded-full transition-transform shadow',
                hasDuration && 'translate-x-5'
              )}
            />
          </button>
          <span className="text-sm font-bold text-text-primary">Definir data de encerramento</span>
        </label>

        {hasDuration && (
          <div className="mt-4 space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              {DURATION_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.days}
                  type="button"
                  onClick={() => onChange({ durationDays: suggestion.days })}
                  className={cn(
                    'text-left p-3 rounded-lg border-2 transition-all',
                    value.durationDays === suggestion.days
                      ? 'border-brand bg-brand/10'
                      : 'border-border hover:border-brand/40'
                  )}
                >
                  <div className="font-bold text-text-primary">{suggestion.days} dias</div>
                  <div className="text-xs text-text-secondary mt-1">{suggestion.description}</div>
                </button>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium text-text-secondary mb-1 block">Número de dias</label>
              <input
                type="number"
                min={1}
                value={value.durationDays}
                onChange={(e) => onChange({ durationDays: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-border rounded-lg bg-surface text-text-primary transition-all duration-200 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-surface-secondary rounded-xl p-4 space-y-1">
        {total !== null && (
          <p className="text-sm text-text-secondary">
            Investimento total estimado:{' '}
            <span className="font-bold text-text-primary">
              R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </p>
        )}
        <p className="text-xs text-text-tertiary">
          Investimento mínimo: R$ 7/dia (US$ 1,00 + 30% = R$ 7 ou aproximadamente US$ 1,30/dia para Meta Ads).
        </p>
      </div>
    </div>
  );
}
