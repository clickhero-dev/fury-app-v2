import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { AdySymbol } from '@/components/AdySymbol';

export function ResetPasswordSuccessPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-admin-bg px-5 py-16 text-admin-text">
      {/* Fundo Iluminado */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(120% 90% at 50% -10%, rgba(30,136,168,0.16), transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-[400px]">
        {/* Cabeçalho */}
        <div className="flex flex-col items-center text-center">
          <AdySymbol size={52} />
          <h1 className="mt-5 text-4xl font-medium !text-[#ECEDEF]">ady</h1>
          <p className="!mt-6 text-sm text-admin-text-muted">Seu gestor de tráfego com IA</p>
        </div>

        {/* Card de Sucesso */}
        <div className="mt-10 rounded-2xl border border-white/10 bg-admin-surface p-7 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]">
          <div className="text-center space-y-6">

            {/* Ícone de Sucesso */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-md" />
                <div className="relative inline-flex items-center justify-center size-14 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="size-7 text-emerald-400" strokeWidth={1.5} />
                </div>
              </div>
            </div>

            {/* Texto */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold !text-[#ECEDEF]">Sucesso!</h2>
              <p className="text-sm text-admin-text-muted leading-relaxed">
                Sua senha foi redefinida com sucesso. Agora você pode entrar com sua nova senha.
              </p>
            </div>

            {/* Botão de Ação */}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="flex w-full items-center justify-center rounded-lg bg-admin-petrol py-3 text-sm font-semibold text-admin-bg transition-opacity hover:opacity-90"
            >
              Ir para login
            </button>

          </div>
        </div>

        {/* Rodapé */}
        <p className="!mt-10 text-center text-xs text-admin-text-faint">
          ady é um produto <span className="text-[#CF6F03]">Click Hero</span>
        </p>
      </div>
    </div>
  );
}