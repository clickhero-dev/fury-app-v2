import { useState } from 'react';
import { Sparkles, CheckCircle, AlertCircle, Minus, Plus, Zap } from 'lucide-react';

export interface PrerequisiteCheck {
  label: string;
  short: string;
  ok: boolean;
}

interface IdleStatusProps {
  onGenerate: (postCount: number) => void;
  isLoading: boolean;
  checks?: PrerequisiteCheck[];
}

const MIN_POSTS = 4;
const MAX_POSTS = 30;
const DEFAULT_POSTS = 16;
const QUICK_OPTIONS = [8, 12, 16, 24, 30];

export function IdleStatus({ onGenerate, isLoading, checks }: IdleStatusProps) {
  const [postCount, setPostCount] = useState(DEFAULT_POSTS);
  const allOk = !checks || checks.every(c => c.ok);
  const pending = checks?.filter(c => !c.ok) ?? [];

  const decrement = () => setPostCount(p => Math.max(MIN_POSTS, p - 1));
  const increment = () => setPostCount(p => Math.min(MAX_POSTS, p + 1));

  return (
    <div className="flex flex-col items-center justify-center py-6 px-6">
      {/* Hero icon */}
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-2xl bg-accent/20 blur-xl animate-pulse" />
        <div className="relative inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20">
          <Sparkles className="w-6 h-6 text-accent" />
        </div>
      </div>

      {/* Header */}
      <h1 className="text-2xl font-bold text-text-primary mb-1 text-center">
        Planejador IA
      </h1>
      <p className="text-text-tertiary text-sm max-w-md text-center mb-5">
        Crie um mês inteiro de conteúdo pronto para publicar com inteligência artificial.
      </p>

      {/* Prerequisites — linha compacta */}
      {checks && allOk && (
        <div className="flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-success/8 border border-success/20">
          <CheckCircle className="w-4 h-4 text-success shrink-0" />
          <span className="text-xs text-success font-medium">
            {checks.map(c => c.short).join(' · ')} prontos
          </span>
        </div>
      )}
      {pending.length > 0 && (
        <div className="flex items-start gap-2.5 w-full max-w-sm px-4 py-3 rounded-xl bg-warning/10 border border-warning/25 mb-6">
          <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning">
            Faltam: <span className="font-medium">{pending.map(c => c.short).join(', ')}</span>.
            Complete os requisitos para liberar a geração.
          </p>
        </div>
      )}

      {/* Post count card */}
      <div className="w-full max-w-sm mb-5 bg-surface border border-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3 justify-center">
          <Zap className="w-4 h-4 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary text-center">
            Quantos posts você quer gerar?
          </h2>
        </div>
        <p className="text-text-tertiary text-xs text-center mb-4">
          Escolha a quantidade de conteúdos para o próximo mês.
        </p>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <button
            onClick={decrement}
            disabled={postCount <= MIN_POSTS || isLoading}
            className="p-2.5 rounded-xl bg-surface-secondary border border-border hover:bg-border
                       text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all
                       hover:scale-105 active:scale-95"
            aria-label="Menos postagens"
          >
            <Minus className="w-5 h-5" />
          </button>
          <div className="flex items-baseline gap-1 w-28 justify-center">
            <span className="text-4xl font-bold text-accent tabular-nums">{postCount}</span>
            <span className="text-text-tertiary text-lg">posts</span>
          </div>
          <button
            onClick={increment}
            disabled={postCount >= MAX_POSTS || isLoading}
            className="p-2.5 rounded-xl bg-surface-secondary border border-border hover:bg-border
                       text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all
                       hover:scale-105 active:scale-95"
            aria-label="Mais postagens"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Quick options */}
        <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
          {QUICK_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => setPostCount(n)}
              disabled={isLoading}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all
                ${postCount === n
                  ? 'bg-accent text-white border-accent shadow-sm shadow-accent/25'
                  : 'bg-surface text-text-secondary border-border hover:bg-surface-secondary hover:text-text-primary'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {n}
            </button>
          ))}
        </div>

        <p className="text-text-tertiary text-xs text-center mt-3">
          Mínimo {MIN_POSTS} · Máximo {MAX_POSTS}
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => onGenerate(postCount)}
        disabled={isLoading || !allOk}
        className="relative px-10 py-3.5 bg-accent hover:bg-accent-light disabled:opacity-50
                   text-white font-semibold rounded-2xl text-lg transition-all duration-200
                   shadow-lg shadow-accent/25 hover:shadow-accent-light/40
                   disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
        title={!allOk ? 'Complete os requisitos pendentes para gerar' : undefined}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Gerando...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Gerar planejamento
          </span>
        )}
      </button>
      {!allOk && (
        <p className="text-xs text-warning mt-3">Preencha os requisitos pendentes para continuar</p>
      )}
    </div>
  );
}
