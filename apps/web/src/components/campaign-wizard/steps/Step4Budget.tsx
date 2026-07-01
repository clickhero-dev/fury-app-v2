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
        <h3 className="text-lg font-bold text-gray-900">Quanto vai investir?</h3>
        <p className="text-sm text-gray-500 mt-1">Defina o valor diário do investimento na campanha.</p>
      </div>

      <div>
        <label className="text-sm font-bold text-gray-900 mb-1 block">Investimento diário</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
          <input
            type="number"
            min={7}
            step={1}
            value={value.dailyBudgetBrl}
            onChange={(e) => onChange({ dailyBudgetBrl: Number(e.target.value) })}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/20"
          />
        </div>
        {value.dailyBudgetBrl < 7 && (
          <p className="text-sm text-red-600 mt-1">O investimento mínimo é de R$ 7,00/dia (equivalente a US$ 1,00 + 30%).</p>
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
                  ? 'border-[#E8631A] bg-orange-50 text-[#E8631A]'
                  : 'border-gray-200 text-gray-600 hover:border-[#E8631A]/40'
              )}
            >
              R${amount}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={hasDuration}
            onClick={() => onChange({ durationDays: hasDuration ? undefined : 7 })}
            className={cn(
              'w-11 h-6 rounded-full transition-colors relative flex-shrink-0',
              hasDuration ? 'bg-[#E8631A]' : 'bg-gray-300'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow',
                hasDuration && 'translate-x-5'
              )}
            />
          </button>
          <span className="text-sm font-bold text-gray-900">Definir data de encerramento</span>
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
                      ? 'border-[#E8631A] bg-orange-50'
                      : 'border-gray-200 hover:border-[#E8631A]/40'
                  )}
                >
                  <div className="font-bold text-gray-900">{suggestion.days} dias</div>
                  <div className="text-xs text-gray-500 mt-1">{suggestion.description}</div>
                </button>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Número de dias</label>
              <input
                type="number"
                min={1}
                value={value.durationDays}
                onChange={(e) => onChange({ durationDays: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/20"
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-50 rounded-xl p-4 space-y-1">
        {total !== null && (
          <p className="text-sm text-gray-700">
            Investimento total estimado:{' '}
            <span className="font-bold text-gray-900">
              R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </p>
        )}
        <p className="text-xs text-gray-400">
          Investimento mínimo: R$ 7/dia (US$ 1,00 + 30% = R$ 7 ou aproximadamente US$ 1,30/dia para Meta Ads).
        </p>
      </div>
    </div>
  );
}
