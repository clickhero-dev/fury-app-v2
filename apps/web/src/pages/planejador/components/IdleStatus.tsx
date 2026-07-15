import { Sparkles, CheckCircle } from 'lucide-react';

interface IdleStatusProps {
  onGenerate: () => void;
  isLoading: boolean;
}

const checks = [
  'Instagram conectado',
  'Facebook conectado',
  'Produtos cadastrados',
  'Objetivo definido',
  'Tom de voz definido',
];

export function IdleStatus({ onGenerate, isLoading }: IdleStatusProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      {/* Header */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/10 mb-6">
          <Sparkles className="w-8 h-8 text-orange-400" />
        </div>
        <h1 className="text-3xl font-semibold text-white mb-3">
          Planejador IA
        </h1>
        <p className="text-gray-400 text-lg max-w-md">
          Sua empresa está pronta. A IA vai criar um mês inteiro de conteúdo com um clique.
        </p>
      </div>

      {/* Status checks */}
      <div className="w-full max-w-sm space-y-3 mb-12">
        {checks.map((label) => (
          <div
            key={label}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1F2937] border border-gray-700/50"
          >
            <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
            <span className="text-gray-300 text-sm">{label}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onGenerate}
        disabled={isLoading}
        className="relative px-10 py-4 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 
                   text-white font-semibold rounded-2xl text-lg transition-all duration-200
                   shadow-lg shadow-orange-500/25 hover:shadow-orange-400/40
                   disabled:cursor-not-allowed"
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
    </div>
  );
}
