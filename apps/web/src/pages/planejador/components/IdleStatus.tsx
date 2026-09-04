import { useState } from "react";
import { Sparkles, CheckCircle2, AlertCircle, Wand2 } from "lucide-react";
import { GenerateConfirmationModal } from "./GenerateConfirmationModal";

export interface PrerequisiteCheck {
  label: string;
  value?: string;
  ok: boolean;
}

interface IdleStatusProps {
  onGenerate: (postsCount: number) => void;
  isLoading: boolean;
  checks?: PrerequisiteCheck[];
  creativesRemaining: number | null;
  creativesLimit: number | null;
  quotaSufficient: boolean;
}

export function IdleStatus({ onGenerate, isLoading, checks, creativesRemaining, creativesLimit, quotaSufficient }: IdleStatusProps) {
  const [showModal, setShowModal] = useState(false);
  
  // Mantém a lógica original: se checks não for passado, libera o botão
  const allOk = !checks || checks.every((c) => c.ok);

  const handleGenerateClick = () => {
    if (quotaSufficient) {
      setShowModal(true);
    }
  };

  const handleConfirmGenerate = (postsCount: number) => {
    setShowModal(false);
    onGenerate(postsCount);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-10 lg:py-14">
      {/* Badges do Topo */}
      <header className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold tracking-wide text-accent-foreground uppercase">
          <Sparkles className="size-3.5" />
          PLANEJADOR IA
        </span>
      </header>

      {/* Banner Principal com Gradiente Teal */}
      <section className="relative mt-5 overflow-hidden rounded-3xl gradient-teal shadow-lift text-primary-foreground">
        <div className="absolute inset-0 grid-dots opacity-70" aria-hidden="true" />
        
        <div className="relative grid gap-8 p-8 lg:grid-cols-[1.15fr_0.85fr] lg:p-12 items-center">
          {/* Coluna Esquerda: Texto e Chamada de Ação */}
          <div>
            <h1 className="text-3xl leading-tight font-semibold tracking-tight lg:text-[2.6rem]">
              Seu mês de conteúdo,
              <br />
              planejado em um clique.
            </h1>
            <p className="mt-4 max-w-md text-base text-primary-foreground/80">
              Sua empresa já está configurada. A IA monta as quatro semanas com temas, peças e
              verba sugerida — você só revisa e aprova.
            </p>

            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={isLoading || !allOk || !quotaSufficient}
              title={!allOk ? 'Complete todos os requisitos pendentes para gerar' : !quotaSufficient ? 'Cota insuficiente para gerar planejamento' : undefined}
              className="mt-8 inline-flex items-center gap-2 rounded-xl gradient-spark px-6 py-3.5 text-base font-semibold text-white shadow-soft transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              {isLoading ? (
                <>
                  <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span className="text-white">Gerando…</span>
                </>
              ) : (
                <>
                  <Wand2 className="size-5 text-white" />
                  <span className="text-white">Gerar planejamento</span>
                </>
              )}
            </button>

            <p className="mt-3 text-xs text-primary-foreground/70">
              {allOk && quotaSufficient
                ? "Nada é publicado sem a sua aprovação."
                : !quotaSufficient
                ? "Cota insuficiente para gerar planejamento."
                : "Preencha os requisitos pendentes para continuar."}
            </p>
          </div>

          {/* Coluna Direita: Checklist de Status (Renderizado apenas se a prop 'checks' for passada) */}
          {checks && checks.length > 0 && (
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-white/90">
                  {allOk ? "Sua empresa está pronta" : "Falta pouco para começar"}
                </p>
              </div>
              <ul className="space-y-2.5">
                {checks.map((c) => (
                  <li
                    key={c.label}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm"
                  >
                    {c.ok ? (
                      <CheckCircle2 className="size-4 shrink-0 text-spark" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0 text-white/60" />
                    )}
                    <div className="min-w-0 leading-tight space-y-0.5">
                      <p className="truncate text-xs font-semibold text-white">
                        {c.label}
                      </p>
                      {c.value && (
                        <p className="truncate text-[11px] text-white/75">
                          {c.value}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Cards Informativos do Rodapé */}
      <footer className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="surface-card p-6">
          <span className="flex size-7 items-center justify-center rounded-full bg-teal-soft dark:bg-teal-soft/30 text-xs font-bold text-teal dark:text-teal">
            1
          </span>
          <h3 className="mt-3 text-base font-bold text-text-primary">Lê o seu negócio</h3>
          <p className="mt-1 text-xs lg:text-sm text-text-secondary leading-relaxed">
            Usa o que já sabe da sua empresa, das campanhas anteriores e do que deu certo.
          </p>
        </div>

        <div className="surface-card p-6">
          <span className="flex size-7 items-center justify-center rounded-full bg-teal-soft dark:bg-teal-soft/30 text-xs font-bold text-teal dark:text-teal">
            2
          </span>
          <h3 className="mt-3 text-base font-bold text-text-primary">Monta o mês</h3>
          <p className="mt-1 text-xs lg:text-sm text-text-secondary leading-relaxed">
            Temas semanais, peças de conteúdo e verba sugerida, dia a dia, com justificativa.
          </p>
        </div>

        <div className="surface-card p-6">
          <span className="flex size-7 items-center justify-center rounded-full bg-teal-soft dark:bg-teal-soft/30 text-xs font-bold text-teal dark:text-teal">
            3
          </span>
          <h3 className="mt-3 text-base font-bold text-text-primary">Você aprova</h3>
          <p className="mt-1 text-xs lg:text-sm text-text-secondary leading-relaxed">
            Revise, ajuste o que quiser e envie tudo para o calendário com um clique.
          </p>
        </div>
      </footer>

      {/* Modal de Confirmação */}
      <GenerateConfirmationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={handleConfirmGenerate}
        creativesRemaining={creativesRemaining}
        creativesLimit={creativesLimit}
        defaultPostsToGenerate={8}
      />
    </div>
  );
}