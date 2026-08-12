import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { JobStatus } from '../types';
import { stageLabel } from '../progress';

interface GeneratingStateProps {
  jobStatus: JobStatus | null;
}

export function GeneratingState({ jobStatus }: GeneratingStateProps) {
  if (!jobStatus) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse" />
          <Loader2 className="relative h-8 w-8 animate-spin text-accent" />
        </div>
        <p className="mt-5 text-sm text-text-secondary">Iniciando pipeline…</p>
      </div>
    );
  }

  if (jobStatus.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <div className="w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center mb-4">
          <AlertCircle className="h-8 w-8 text-error" />
        </div>
        <p className="text-lg font-semibold text-text-primary">Erro na geração</p>
        <p className="text-sm text-text-tertiary mt-1 max-w-sm text-center">{jobStatus.error || 'Erro desconhecido'}</p>
      </div>
    );
  }

  const done = jobStatus.status === 'done';

  const steps = jobStatus.agentProgress ?? [];
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const totalSteps = 10;

  return (
    <div className="flex flex-col items-center justify-center py-10 px-6">
      {/* Icon */}
      {done ? (
        <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
      ) : (
        <div className="relative mb-4">
          <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        </div>
      )}

      {/* Current stage label */}
      <p className="text-base font-medium text-text-primary text-center mb-1">
        {stageLabel(jobStatus.currentAgent)}
      </p>

      {/* Step counter */}
      <p className="text-sm text-text-secondary mb-6">
        Etapa {completedSteps} de {totalSteps}
      </p>

      {/* Agent steps list */}
      {steps.length > 0 && (
        <div className="w-full max-w-md mt-6 space-y-1.5">
          {steps.map((step) => (
            <AgentStepRow key={step.name} name={step.name} status={step.status} pct={step.pct} />
          ))}
        </div>
      )}

      {!done && (
        <p className="mt-6 text-xs text-text-tertiary flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Leva menos de 1 minuto. Você pode manter esta página aberta.
        </p>
      )}
    </div>
  );
}

const STEP_LABELS: Record<string, string> = {
  'Context Agent': 'Contexto',
  'Research Agent': 'Pesquisa',
  'Analytics Agent': 'Analytics',
  'Strategy Agent': 'Estratégia',
  'Planner Agent': 'Planejamento',
  'Copywriter Agent': 'Copywriting',
  'Creative Agent': 'Criativo',
  'Quality Agent': 'Qualidade',
  'Scheduler Agent': 'Agendamento',
  'Branding Agent': 'Branding',
  'Pipeline concluído': 'Concluído',
};

function AgentStepRow({ name, status, pct }: { name: string; status: string; pct: number }) {
  const label = STEP_LABELS[name] ?? name;
  const isDone = status === 'completed';
  const isRunning = status === 'running';
  const isFailed = status === 'failed';

  return (
    <div className="flex items-center gap-3 py-1.5 px-3 rounded-lg transition-colors">
      {/* Status dot */}
      <div className="shrink-0">
        {isDone ? (
          <div className="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          </div>
        ) : isRunning ? (
          <div className="w-5 h-5 rounded-full bg-accent/15 flex items-center justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
          </div>
        ) : isFailed ? (
          <div className="w-5 h-5 rounded-full bg-error/15 flex items-center justify-center">
            <AlertCircle className="h-3.5 w-3.5 text-error" />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-border" />
        )}
      </div>

      {/* Label */}
      <span className={
        isDone ? 'text-sm text-text-secondary flex-1' :
        isRunning ? 'text-sm font-medium text-text-primary flex-1' :
        'text-sm text-text-tertiary flex-1'
      }>
        {label}
      </span>

      {/* Percentage or status text */}
      {isRunning && <span className="text-xs text-accent tabular-nums font-medium">{pct}%</span>}
    </div>
  );
}
