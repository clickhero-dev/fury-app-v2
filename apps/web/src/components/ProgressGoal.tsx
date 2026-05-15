import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProgressGoalProps {
  label: string;
  progressPercent: number;
  onTrack: boolean;
  currentLabel: string;
  targetLabel: string;
}

export function ProgressGoal({ label, progressPercent, onTrack, currentLabel, targetLabel }: ProgressGoalProps) {
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
