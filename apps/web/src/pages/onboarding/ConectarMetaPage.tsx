import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AdySymbol } from '@/components/AdySymbol';
import { Check, CheckCircle2 } from 'lucide-react';

const steps = [
  { label: 'Conectar Meta' },
  { label: 'Definir Meta' },
  { label: 'Pronto' },
];

function ProgressSteps({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-2">
              <div
                className={[
                  'size-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all border',
                  done
                    ? 'bg-admin-petrol border-admin-petrol text-admin-bg'
                    : active
                    ? 'bg-admin-surface border-admin-petrol text-admin-petrol font-bold'
                    : 'bg-admin-surface border-white/10 text-admin-text-faint',
                ].join(' ')}
              >
                {done ? (
                  <Check className="size-4 stroke-[3]" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={[
                  'text-xs font-medium whitespace-nowrap transition-colors',
                  active || done ? 'text-admin-text font-semibold' : 'text-admin-text-faint',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={[
                  'w-16 h-px mb-6 mx-3 transition-colors',
                  i < current ? 'bg-admin-petrol' : 'bg-white/10',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetaIcon() {
  return (
    <div className="flex items-center justify-center size-16 rounded-2xl bg-[#1877F2]/10 border border-[#1877F2]/20">
      <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-10">
        <path
          d="M12 32.5C12 26.5 15.5 21 20.5 21C23.2 21 25.5 22.8 27.5 25.8C29.5 22.8 31.8 21 34.5 21C39.5 21 43 26.5 43 32.5C43 38.5 39.8 43 35.5 43C33 43 30.8 41.2 29 38.5L30 37C31.5 39.2 33 40.5 35.5 40.5C38.2 40.5 40.5 37 40.5 32.5C40.5 27.8 37.8 23.5 34.5 23.5C32.5 23.5 30.5 25 28.8 28.5L30 32.5L28 33.5L26.5 28.5C24.8 25 22.8 23.5 20.5 23.5C17.2 23.5 14.5 27.8 14.5 32.5C14.5 37 16.8 40.5 19.5 40.5C22 40.5 23.5 39.2 25 37L26 38.5C24.2 41.2 22 43 19.5 43C15.2 43 12 38.5 12 32.5Z"
          fill="#1877F2"
        />
      </svg>
    </div>
  );
}

export function ConectarMetaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isConnected = searchParams.get('connected') === 'true';
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isConnected) {
      queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
    }
  }, [isConnected, queryClient]);

  const currentStep = isConnected ? 1 : 0;

  return (
    <div className="relative flex min-h-screen flex-col bg-admin-bg text-admin-text">
      {/* Fundo Iluminado — bem mais discreto no claro (a mesma proporção de opacidade do escuro cria uma linha visível contra fundo claro, que não aparece contra fundo escuro) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(150%_120%_at_50%_-10%,rgba(23,112,138,0.07),transparent_100%)] dark:bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(30,136,168,0.16),transparent_70%)]"
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-center border-b border-white/10 py-5">
        <div className="flex items-center gap-2">
          <AdySymbol size={28} />
          <span className="text-xl font-medium text-admin-text">ady</span>
        </div>
      </header>

      {/* Progress */}
      <div className="relative z-10 pt-10 pb-8 flex justify-center">
        <ProgressSteps current={currentStep} />
      </div>

      {/* Content */}
      <main className="ady-decor relative z-10 flex-1 flex flex-col items-center justify-start px-5 pt-4 pb-16">
        <div className="relative w-full max-w-[480px]">
          {isConnected ? (
            /* ── Passo 2: conta conectada ── */
            <div className="flex flex-col items-center text-center gap-6 rounded-2xl border border-white/10 bg-admin-surface p-8 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-md" />
                <div className="relative flex items-center justify-center size-16 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="size-8 text-emerald-400" />
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-admin-text">
                  Ótimo! Conta conectada 🎉
                </h1>
                <p className="text-sm text-admin-text-muted leading-relaxed">
                  Agora selecione a conta de anúncios que você quer gerenciar com a <strong className="text-admin-text">ady</strong>.
                </p>
              </div>

              <div className="w-full pt-2">
                <Button
                  onClick={() => navigate('/onboarding/selecionar-conta')}
                  className="w-full bg-admin-petrol text-admin-bg font-semibold py-3 h-auto rounded-lg hover:opacity-90 transition-opacity"
                >
                  Selecionar conta de anúncios
                </Button>
              </div>
            </div>
          ) : (
            /* ── Passo 1: conectar ── */
            <div className="flex flex-col items-center text-center gap-6 rounded-2xl border border-white/10 bg-admin-surface p-8 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]">
              <MetaIcon />

              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-admin-text">
                  Conecte sua conta de anúncios
                </h1>
                <p className="text-sm text-admin-text-muted leading-relaxed">
                  Vincule sua conta do Meta Ads para começar a automatizar suas campanhas com inteligência artificial.
                </p>
              </div>

              <div className="w-full rounded-xl border border-white/10 bg-admin-bg p-5 text-left">
                <ul className="space-y-3">
                  {[
                    'Gerencie e automatize suas campanhas com IA',
                    'Dados e métricas atualizados em tempo real',
                    'Você pode revogar o acesso a qualquer momento',
                  ].map((item) => (
                    <li key={item} className="flex gap-3 items-start">
                      <div className="flex size-5 items-center justify-center rounded-full bg-admin-petrol/20 text-admin-petrol shrink-0 mt-0.5">
                        <Check className="size-3 stroke-[3]" />
                      </div>
                      <span className="text-xs text-admin-text font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="w-full pt-2">
                <Button
                  onClick={() => navigate('/onboarding/meta-authorize')}
                  className="w-full bg-admin-petrol text-admin-bg font-semibold py-3 h-auto rounded-lg hover:opacity-90 transition-opacity"
                >
                  Conectar com Meta
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}