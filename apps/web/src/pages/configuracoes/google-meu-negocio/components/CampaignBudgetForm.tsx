import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

const MIN_MONTHLY = 30;
const MAX_MONTHLY = 50_000;

/** Verba mensal → orçamento médio diário (padrão Google: mensal / 30.4). */
export function monthlyToDaily(monthlyBRL: number): number {
  return monthlyBRL / 30.4;
}

interface CampaignBudgetFormProps {
  onSubmit: (monthlyBudgetBRL: number) => Promise<void> | void;
  submitting?: boolean;
  disabled?: boolean;
}

/**
 * Formulário de verba mensal para a campanha de promoção do perfil no Google
 * (Fluxo 3). Converte e exibe o valor diário médio que o Google vai usar.
 */
export function CampaignBudgetForm({ onSubmit, submitting, disabled }: CampaignBudgetFormProps) {
  const [monthly, setMonthly] = useState('');
  const [error, setError] = useState<string | null>(null);

  const monthlyNumber = monthly.replace(',', '.').trim() === '' ? NaN : Number(monthly.replace(',', '.').trim());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (Number.isNaN(monthlyNumber) || monthlyNumber < MIN_MONTHLY || monthlyNumber > MAX_MONTHLY) {
      setError(`Informe uma verba mensal entre R$ ${MIN_MONTHLY} e R$ ${MAX_MONTHLY}.`);
      return;
    }
    setError(null);
    void onSubmit(monthlyNumber);
  }

  const daily = Number.isNaN(monthlyNumber) ? null : monthlyToDaily(monthlyNumber);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Megaphone className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-text-primary">Anunciar perfil no Google</h3>
          <p className="text-xs text-text-tertiary">
            Sua empresa aparece em destaque nas buscas do Google. Você paga o Google diretamente —
            definimos o orçamento médio diário com base na sua verba mensal.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-secondary">Verba mensal (R$)</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
              R$
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_MONTHLY}
              max={MAX_MONTHLY}
              step="10"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              placeholder="300"
              disabled={disabled || submitting}
              className="w-full rounded-xl border border-border bg-surface px-8 py-2 text-sm text-text-primary outline-none transition-colors focus:border-brand"
            />
          </div>
        </label>

        <div className="flex flex-col justify-end">
          <span className="mb-1 block text-xs font-medium text-text-secondary">
            Orçamento médio diário
          </span>
          <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-secondary">
            {daily === null ? '—' : `R$ ${daily.toFixed(2)}/dia`}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={disabled || submitting}
        className={cn(
          'inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-xs font-semibold text-white cursor-pointer transition-all duration-200',
          'hover:scale-[1.02] active:scale-[0.98]',
          (disabled || submitting) && 'cursor-not-allowed opacity-50'
        )}
      >
        {submitting ? 'Criando campanha…' : 'Ativar anúncio'}
      </button>
    </form>
  );
}