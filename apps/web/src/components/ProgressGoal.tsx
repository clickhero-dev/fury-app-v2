import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProgressGoalProps {
  /** Label descritivo da meta (ex: "ROAS", "CPA"). */
  label: string;
  /** Percentual de progresso de 0 a 100. Valores fora do intervalo são limitados. */
  progressPercent: number;
  /** Indica se a meta está sendo atingida conforme o esperado para o período. */
  onTrack: boolean;
  /** Valor atual formatado para exibição (ex: "R$ 38,00", "4.2x"). */
  currentLabel: string;
  /** Valor alvo formatado para exibição (ex: "R$ 50,00", "4.0x"). */
  targetLabel: string;
}

/**
 * Componente de progresso de meta com indicador de status visual.
 *
 * Exibe uma barra de progresso colorida e um chip de status baseados
 * no percentual atingido e se a meta está no caminho certo.
 *
 * Lógica de status:
 * - ✅ Verde "No caminho certo" → `onTrack = true`
 * - ⚠️ Amarelo "Atenção necessária" → `onTrack = false` e progresso ≥ 40%
 * - ❌ Vermelho "Abaixo da meta" → `onTrack = false` e progresso < 40%
 *
 * @example
 * <ProgressGoal
 *   label="ROAS"
 *   progressPercent={75}
 *   onTrack={true}
 *   currentLabel="4.2x"
 *   targetLabel="4.0x"
 * />
 */
export function ProgressGoal({ label, progressPercent, onTrack, currentLabel, targetLabel }: ProgressGoalProps) {
  // Limita o progresso entre 0 e 100 para evitar overflow na barra
  const clamped = Math.min(100, Math.max(0, progressPercent));

  const isGreen = onTrack;
  const isYellow = !onTrack && clamped >= 40;

  const StatusIcon = isGreen ? CheckCircle2 : isYellow ? AlertTriangle : XCircle;
  const statusText = isGreen ? 'No caminho certo' : isYellow ? 'Atenção necessária' : 'Abaixo da meta';

  const statusChipClass = isGreen
    ? 'bg-success-light text-success'
    : isYellow
      ? 'bg-warning-light text-warning'
      : 'bg-error-light text-error';

  const barClass = isGreen ? 'bg-success' : isYellow ? 'bg-warning' : 'bg-error';

  return (
    <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
      {/* Cabeçalho: label, percentual e chip de status */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{label}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-text-primary">{clamped}%</span>
            <span className="text-sm text-text-secondary">do mês concluído</span>
          </div>
        </div>
        <span className={cn('flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg', statusChipClass)}>
          <StatusIcon className="w-3.5 h-3.5" />
          {statusText}
        </span>
      </div>

      {/* Barra de progresso e valores atual/meta */}
      <div className="space-y-2">
        <div className="h-2.5 bg-surface-secondary rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', barClass)}
            style={{ width: `${clamped}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-text-secondary">
          <span>
            Atual:{' '}
            <span className="font-semibold text-text-primary">{currentLabel}</span>
          </span>
          <span>
            Meta:{' '}
            <span className="font-semibold text-text-primary">{targetLabel}</span>
          </span>
        </div>
      </div>
    </div>
  );
}