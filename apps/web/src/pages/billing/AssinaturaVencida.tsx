import { useEffect } from 'react';
import { AlertTriangle, Mail, ArrowRight } from 'lucide-react';
import { AdySymbol } from '@/components/AdySymbol';

export function AssinaturaVencida() {
  // Garantir sincronização/limpeza inicial de tema se necessário
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || localStorage.getItem('ady-theme');

    if (savedTheme === 'escuro' || savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (savedTheme === 'claro' || savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f3f6f8] px-5 py-16 text-slate-900 transition-colors duration-300 overflow-hidden">
      
      {/* Grid de Fundo */}
      <div 
        aria-hidden 
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(#1E88A8 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Glow Radial */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% -10%, rgba(30, 136, 168, 0.22) 0%, transparent 60%)`,
        }}
      />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Header / Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="p-2">
            <AdySymbol size={52} />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">ady</h1>
          <p className="!mt-1.5 text-sm font-medium text-slate-500">Seu gestor de tráfego com IA</p>
        </div>

        {/* Card Principal - Branco e Limpo no Tema Claro */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-7 shadow-xl backdrop-blur-md transition-all text-center space-y-6">
          
          {/* Ícone de Alerta */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-md" />
              <div className="relative inline-flex items-center justify-center size-14 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600">
                <AlertTriangle className="size-7" strokeWidth={1.75} />
              </div>
            </div>
          </div>

          {/* Textos Informativos */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Assinatura Vencida</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Sua assinatura expirou. Para continuar aproveitando todas as funcionalidades do ady, escolha um novo plano ou entre em contato com o suporte.
            </p>
          </div>

          {/* Canais de Atendimento */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4 text-left">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Canais de atendimento
            </h3>
            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
              <Mail className="size-4 text-[#1E88A8]" />
              <a 
                href="mailto:rafael@clickhero.com.br" 
                className="hover:text-[#1E88A8] transition-colors"
              >
                rafael@clickhero.com.br
              </a>
            </div>
          </div>

          {/* Botão de Ação */}
          <a
            href="/planos"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E88A8] py-3 text-sm font-semibold text-white shadow-md shadow-[#1E88A8]/20 transition-all duration-200 hover:!bg-[#17708A] hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99]"
          >
            <span>Ver planos disponíveis</span>
            <ArrowRight className="size-4" />
          </a>

        </div>
      </div>
    </div>
  );
}