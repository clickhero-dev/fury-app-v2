import { Sparkles, CheckCircle, AlertCircle } from 'lucide-react';

export interface PrerequisiteCheck {
  label: string;
  ok: boolean;
}

interface IdleStatusProps {
  onGenerate: () => void;
  isLoading: boolean;
  checks?: PrerequisiteCheck[];
}

export function IdleStatus({ onGenerate, isLoading, checks }: IdleStatusProps) {
  const allOk = !checks || checks.every(c => c.ok);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      {/* Icon */}
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-6">
        <Sparkles className="w-8 h-8 text-accent" />
      </div>

      {/* Title */}
      <h1 className="text-3xl font-semibold text-text-primary mb-3 text-center">
        Planejador IA
      </h1>
      <p className="text-text-tertiary text-lg max-w-md text-center mb-12">
        Sua empresa está pronta. A IA vai criar um mês inteiro de conteúdo com um clique.
      </p>

      {/* Dynamic checks */}
      {checks && (
        <div className="w-full max-w-sm space-y-3 mb-12">
          {checks.map((c) => (
            <div
              key={c.label}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border"
            >
              {c.ok ? (
                <CheckCircle className="w-5 h-5 text-success shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
              )}
              <span className={c.ok ? 'text-text-secondary text-sm' : 'text-text-primary text-sm font-medium'}>
                {c.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={onGenerate}
        disabled={isLoading || !allOk}
        className="relative px-10 py-4 bg-accent hover:bg-accent-light disabled:opacity-50 
                   text-white font-semibold rounded-2xl text-lg transition-all duration-200
                   shadow-lg shadow-accent/25 hover:shadow-accent-light/40
                   disabled:cursor-not-allowed"
        title={!allOk ? 'Complete todos os requisitos acima para gerar' : undefined}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Gerando...
          </span>
        ) : (
          'Gerar planejamento'
        )}
      </button>
      {!allOk && (
        <p className="text-xs text-yellow-500 mt-3">Preencha os requisitos pendentes para continuar</p>
      )}
    </div>
  );
}
