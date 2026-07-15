import { CheckCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const steps = [
  'Entendendo sua empresa',
  'Analisando campanhas anteriores',
  'Pesquisando concorrentes',
  'Encontrando oportunidades',
  'Identificando tendências',
  'Buscando datas comemorativas',
  'Criando estratégia',
  'Distribuindo conteúdos',
  'Escrevendo legendas',
  'Criando imagens',
  'Organizando calendário',
  'Finalizando',
];

export function GeneratingState() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (currentStep < steps.length - 1) {
      const t = setTimeout(() => setCurrentStep((s) => s + 1), 1500 + Math.random() * 1000);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-full max-w-md">
        {/* Title */}
        <h2 className="text-2xl font-semibold text-text-primary text-center mb-2">
          Criando seu planejamento
        </h2>
        <p className="text-text-tertiary text-center text-sm mb-12">
          A IA está analisando sua empresa e montando a estratégia ideal
        </p>

        {/* Progress bar */}
        <div className="mb-10">
          <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-right text-text-tertiary text-xs mt-2">{Math.round(progress)}%</p>
        </div>

        {/* Steps */}
        <div className="space-y-1">
          {steps.map((step, i) => (
            <div
              key={step}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300 ${
                i <= currentStep ? 'opacity-100' : 'opacity-20'
              } ${i === currentStep ? 'bg-surface border border-border' : ''}`}
            >
              {i < currentStep ? (
                <CheckCircle className="w-5 h-5 text-success shrink-0" />
              ) : i === currentStep ? (
                <Loader2 className="w-5 h-5 text-accent animate-spin shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-text-tertiary shrink-0" />
              )}
              <span
                className={`text-sm ${
                  i <= currentStep ? 'text-text-primary' : 'text-text-tertiary'
                }`}
              >
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
