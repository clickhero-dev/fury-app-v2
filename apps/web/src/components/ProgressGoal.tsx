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

export function ProgressGoal({ label, progressPercent, onTrack, currentLabel, targetLabel }: ProgressGoalProps) {
  // Limita o progresso entre 0 e 100 para evitar overflow na barra
  const clamped = Math.min(100, Math.max(0, progressPercent));

  const isGreen = onTrack;
  const isYellow = !onTrack && clamped >= 40;

  const StatusIcon = isGreen ? CheckCircle2 : isYellow ? AlertTriangle : XCircle;
  const statusText = isGreen ? 'No caminho certo' : isYellow ? 'Atenção necessária' : 'Abaixo da meta';

  const statusChipClass = isGreen
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : isYellow
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400';

  return (
    <div className="bg-white dark:bg-[#12130F] rounded-2xl border border-slate-200 dark:border-white/10 p-6 space-y-5 shadow-sm">
      {/* Cabeçalho: Círculo de %, label e chip de status */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {/* Círculo do percentual arredondado */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#1E88A8]/30 bg-[#1E88A8]/10 text-[#1E88A8]">
            <span className="text-xl font-bold">{clamped}%</span>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">{label}</p>
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mt-0.5">do mês concluído</p>
          </div>
        </div>

        <span className={cn('flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full', statusChipClass)}>
          <StatusIcon className="w-4 h-4" />
          {statusText}
        </span>
      </div>

      {/* Barra de progresso sempre no tom Azul Petróleo */}
      <div className="space-y-2">
        <div className="h-2.5 w-full bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1E88A8] rounded-full transition-all duration-700"
            style={{ width: `${clamped}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 dark:text-zinc-400 font-medium">
          <span>
            Atual: <span className="font-semibold text-slate-900 dark:text-white">{currentLabel}</span>
          </span>
          <span>
            Meta: <span className="font-semibold text-slate-900 dark:text-white">{targetLabel}</span>
          </span>
        </div>
      </div>
    </div>
  );
}