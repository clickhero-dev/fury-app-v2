import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, Video } from 'lucide-react';
import { useStudioVideoJob } from '@/hooks/useStudioVideo';
import type { StudioVideoJob, StudioVideoStage } from '@/types/studio';

const STEPS: Array<{ stages: StudioVideoStage[]; label: string }> = [
  { stages: ['queued', 'script'], label: 'Escrevendo o roteiro' },
  { stages: ['voice'], label: 'Gravando a narração e a legenda' },
  { stages: ['scenes'], label: 'Buscando as cenas' },
  { stages: ['render'], label: 'Montando o vídeo' },
  { stages: ['saving'], label: 'Salvando na biblioteca' },
];

function stepIndex(stage: StudioVideoStage): number {
  if (stage === 'done') return STEPS.length;
  return Math.max(0, STEPS.findIndex((s) => s.stages.includes(stage)));
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface Props {
  jobId: string;
  onDone: (job: StudioVideoJob) => void;
  onRetry: () => void;
  onBack: () => void;
}

export function VideoProgress({ jobId, onDone, onRetry, onBack }: Props) {
  const { data: job, isError } = useStudioVideoJob(jobId);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (job?.status === 'done') onDone(job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  if (job?.status === 'error' || isError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-5 text-center">
        <div className="rounded-full bg-warning/10 p-5">
          <AlertCircle className="h-10 w-10 text-warning" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">Não foi possível gerar o vídeo</h2>
          <p className="mt-2 text-sm text-text-tertiary">{job?.error ?? 'Verifique sua conexão e tente novamente'}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={onRetry} className="rounded-full bg-brand-hover px-5 py-2 text-sm font-semibold text-white">
            Tentar novamente
          </button>
          <button type="button" onClick={onBack} className="rounded-full border border-border px-5 py-2 text-sm font-medium text-text-primary hover:bg-surface-secondary">
            Voltar para Biblioteca
          </button>
        </div>
      </div>
    );
  }

  const progress = job?.progress ?? 0;
  const current = stepIndex(job?.stage ?? 'queued');
  const elapsed = job ? formatElapsed(now - new Date(job.createdAt).getTime()) : '0:00';

  return (
    <div className="flex justify-center pt-6">
      <div className="w-full max-w-xl space-y-6 rounded-[20px] border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand/15 text-brand">
            <Video className="h-7 w-7" />
          </div>
          <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-text-primary">O ady está montando seu vídeo</h2>
          <p className="line-clamp-1 text-sm text-text-tertiary">{job?.prompt}</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">{STEPS[Math.min(current, STEPS.length - 1)].label}</span>
            <span className="font-semibold text-text-primary">{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Progresso do vídeo"
            className="h-2 overflow-hidden rounded-full bg-text-tertiary/20"
          >
            <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-xs text-text-tertiary">
            <span>Tempo decorrido {elapsed}</span>
            <span>Costuma levar de 5 a 8 min</span>
          </div>
        </div>

        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              {i < current ? (
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : i === current ? (
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-brand">
                  <Loader2 className="h-3 w-3 animate-spin text-brand" />
                </span>
              ) : (
                <span className="h-6 w-6 shrink-0 rounded-full border-2 border-border" />
              )}
              <span className={i === current ? 'font-semibold text-text-primary' : i < current ? 'text-text-secondary' : 'text-text-tertiary'}>
                {step.label}
              </span>
            </li>
          ))}
        </ol>

        <p className="rounded-xl bg-surface-secondary px-3.5 py-3 text-sm leading-relaxed text-text-secondary">
          Pode sair desta tela. O vídeo continua sendo gerado e aparece na sua biblioteca quando ficar pronto.
        </p>
      </div>
    </div>
  );
}
