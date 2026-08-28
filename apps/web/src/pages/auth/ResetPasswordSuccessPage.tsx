import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { AdySymbol } from '@/components/AdySymbol';

export function ResetPasswordSuccessPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f3f6f8] dark:bg-[#0c0d0a] px-5 py-16 text-slate-900 dark:text-white transition-colors duration-300 overflow-hidden">
      
      {/* 🌌 GRID DE FUNDO */}
      <div 
        aria-hidden 
        className="pointer-events-none absolute inset-0 opacity-[0.08] dark:opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(#1E88A8 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* 🌟 GLOW APENAS AZUL */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% -10%, rgba(30, 136, 168, 0.22) 0%, transparent 60%)`,
        }}
      />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Logo Estática */}
        <div className="flex flex-col items-center text-center">
          <div className="p-2">
            <AdySymbol size={52} />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">ady</h1>
          <p className="!mt-1.5 text-sm font-medium text-slate-500 dark:text-zinc-400">Seu gestor de tráfego com IA</p>
        </div>

        {/* Card de Sucesso */}
        <div className="mt-8 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#181915] p-7 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all">
          <div className="text-center space-y-6">

            {/* Ícone de Sucesso */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-md" />
                <div className="relative inline-flex items-center justify-center size-14 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="size-7 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                </div>
              </div>
            </div>

            {/* Texto */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Sucesso!</h2>
              <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                Sua senha foi redefinida com sucesso. Agora você pode entrar com sua nova senha.
              </p>
            </div>

            {/* Botão de Ação */}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#17708A] py-3 text-sm font-semibold text-white shadow-md shadow-[#17708A]/20 transition-all duration-200 hover:!bg-[#145E74] hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99]"
            >
              Ir para login
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}