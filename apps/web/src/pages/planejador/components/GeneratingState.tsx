import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { JobStatus } from '../types';
import { overallProgress, stageLabel } from '../progress';

interface GeneratingStateProps {
  jobStatus: JobStatus | null;
}

export function GeneratingState({ jobStatus }: GeneratingStateProps) {
  if (!jobStatus) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-text-secondary">Iniciando pipeline…</p>
      </div>
    );
  }

  if (jobStatus.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <AlertCircle className="h-12 w-12 mb-4 text-error" />
        <p className="text-lg font-semibold text-text-primary">Erro na geração</p>
        <p className="text-sm text-text-tertiary mt-1">{jobStatus.error || 'Erro desconhecido'}</p>
      </div>
    );
  }

  const done = jobStatus.status === 'done';
  const pct = done ? 100 : overallProgress(jobStatus.agentProgress);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      {done ? (
        <CheckCircle2 className="h-8 w-8 text-success mb-4" />
      ) : (
        <Loader2 className="h-8 w-8 animate-spin text-accent mb-4" />
      )}

      <p className="text-base font-medium text-text-primary text-center mb-1">
        {stageLabel(jobStatus.currentAgent)}
      </p>
      <p className="text-2xl font-semibold text-text-secondary tabular-nums mb-6">{pct}%</p>

      <div className="w-full max-w-md h-2.5 rounded-full bg-surface-secondary border border-border overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-purple-500 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {!done && (
        <p className="mt-5 text-xs text-text-tertiary">
          Leva menos de 1 minuto. Você pode manter esta página aberta.
        </p>
      )}
    </div>
  );
}