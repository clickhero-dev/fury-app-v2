import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';

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
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                  done || active
                    ? 'bg-[#EA580C] text-white'
                    : 'bg-[#E5E7EB] text-[#9CA3AF]',
                ].join(' ')}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={[
                  'text-xs font-semibold whitespace-nowrap',
                  active || done ? 'text-[#EA580C]' : 'text-[#9CA3AF]',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={[
                  'w-16 h-0.5 mb-5 mx-2',
                  i < current ? 'bg-[#EA580C]' : 'bg-[#E5E7EB]',
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
    <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
      <rect width="60" height="60" rx="16" fill="#1877F2" />
      <path
        d="M12 32.5C12 26.5 15.5 21 20.5 21C23.2 21 25.5 22.8 27.5 25.8C29.5 22.8 31.8 21 34.5 21C39.5 21 43 26.5 43 32.5C43 38.5 39.8 43 35.5 43C33 43 30.8 41.2 29 38.5L30 37C31.5 39.2 33 40.5 35.5 40.5C38.2 40.5 40.5 37 40.5 32.5C40.5 27.8 37.8 23.5 34.5 23.5C32.5 23.5 30.5 25 28.8 28.5L30 32.5L28 33.5L26.5 28.5C24.8 25 22.8 23.5 20.5 23.5C17.2 23.5 14.5 27.8 14.5 32.5C14.5 37 16.8 40.5 19.5 40.5C22 40.5 23.5 39.2 25 37L26 38.5C24.2 41.2 22 43 19.5 43C15.2 43 12 38.5 12 32.5Z"
        fill="white"
      />
    </svg>
  );
}

export function ConectarMetaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isConnected = searchParams.get('connected') === 'true';

  const currentStep = isConnected ? 1 : 0;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-[#F3F4F6] px-6 py-4 flex items-center justify-center">
        <span className="text-xl font-black text-[#1C1C1E] tracking-tight">FURY</span>
      </header>

      {/* Progress */}
      <div className="pt-10 pb-8 flex justify-center">
        <ProgressSteps current={currentStep} />
      </div>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-6 pt-4 pb-16">
        <div className="w-full max-w-lg">
          {isConnected ? (
            /* ── Passo 2: conta conectada ── */
            <div className="flex flex-col items-center text-center gap-8">
              <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-green-50 border-2 border-green-200">
                <svg className="w-10 h-10 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-black text-[#1C1C1E] leading-tight">
                  Ótimo! Conta conectada com sucesso 🎉
                </h1>
                <p className="text-[#6E7681] text-lg leading-relaxed">
                  Agora defina sua meta de desempenho para que a FURY possa otimizar suas campanhas automaticamente.
                </p>
              </div>

              <div className="w-full space-y-4">
                <Button
                  onClick={() => navigate('/onboarding/metas')}
                  variant="primary"
                  size="md"
                  className="w-full"
                >
                  Definir minha meta
                </Button>

              </div>
            </div>
          ) : (
            /* ── Passo 1: conectar ── */
            <div className="flex flex-col items-center text-center gap-8">
              <MetaIcon />

              <div className="space-y-3">
                <h1 className="text-3xl font-black text-[#1C1C1E] leading-tight">
                  Conecte sua conta de anúncios
                </h1>
                <p className="text-[#6E7681] text-lg leading-relaxed">
                  Vincule sua conta do Meta Ads para começar a automatizar suas campanhas com inteligência artificial.
                </p>
              </div>

              <div className="w-full bg-[#FFF7F4] border border-[#FDDCCC] rounded-2xl p-5 text-left">
                <ul className="space-y-3">
                  {[
                    'Gerencie e automatize suas campanhas com IA',
                    'Dados e métricas atualizados em tempo real',
                    'Você pode revogar o acesso a qualquer momento',
                  ].map((item) => (
                    <li key={item} className="flex gap-3 items-start">
                      <svg
                        className="w-5 h-5 text-[#EA580C] flex-shrink-0 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm text-[#1C1C1E] font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="w-full space-y-4">
                <Button
                  onClick={() => navigate('/onboarding/meta-authorize')}
                  variant="primary"
                  size="md"
                  className="w-full"
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
