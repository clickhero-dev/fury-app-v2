import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AdySymbol } from '@/components/AdySymbol';
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import { login as authLogin } from '@/store/slices/authSlice';
import { store } from '@/store';

/**
 * Tela de escolha de cadastro: cadastro social (Google) ou formulário manual.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Handle social login redirect (novo usuário volta aqui após autorizar no Google)
    const params = new URLSearchParams(window.location.search);
    const socialData = params.get('social_login');
    if (socialData) {
      try {
        const data = JSON.parse(decodeURIComponent(socialData));
        localStorage.setItem('token', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));
        store.dispatch(authLogin({
          token: data.token,
          refreshToken: data.refreshToken,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role ?? null,
          tenantId: data.user.tenantId,
        }));
        if (data.isNewUser) {
          navigate('/onboarding/conectar-meta');
        } else {
          navigate('/dashboard');
        }
        return;
      } catch {
        setError('Erro ao fazer cadastro com Google');
      }
    }

    }, [navigate]);

  const buttonHover =
    'transition-all duration-200 hover:border-[#1E88A8]/50 hover:bg-white dark:hover:bg-[#1a1b17] [&:hover:not(:disabled)]:shadow-md [&:active:not(:disabled)]:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f3f6f8] dark:bg-[#0c0d0a] px-5 py-16 text-slate-900 dark:text-white transition-colors duration-300 overflow-hidden">
      {/* 🌌 GRID DE FUNDO */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(#1E88A8 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
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

        {/* Card de Escolha de Cadastro */}
        <div className="mt-8 space-y-4 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#181915] p-7 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all">
          <div className="space-y-1 mb-2">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Criar conta</h2>
            <p className="text-sm text-slate-600 dark:text-zinc-400">Comece a automatizar campanhas com ady</p>
          </div>

          {/* Cadastro social Google */}
          <GoogleLoginButton
            label="Cadastrar com Google"
            onSuccess={(data) => {
              localStorage.setItem('token', data.token);
              localStorage.setItem('refreshToken', data.refreshToken);
              localStorage.setItem('user', JSON.stringify(data.user));
              store.dispatch(authLogin({
                token: data.token,
                refreshToken: data.refreshToken,
                name: data.user.name,
                email: data.user.email,
                role: data.user.role ?? null,
                tenantId: data.user.tenantId,
              }));
              if (data.isNewUser) {
                navigate('/onboarding/conectar-meta');
              } else {
                navigate('/dashboard');
              }
            }}
            onError={(msg) => setError(msg)}
          />

          {/* Divisor */}
          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-slate-200 dark:border-white/10" />
            <span className="absolute px-3 text-xs text-slate-400 dark:text-zinc-500 bg-white dark:bg-[#181915]">ou</span>
          </div>

          {/* Cadastro manual */}
          <button
            type="button"
            onClick={() => navigate('/cadastro/formulario')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#17708A] py-3 text-sm font-semibold text-white shadow-md shadow-[#17708A]/20 transition-all duration-200 [&:hover:not(:disabled)]:!bg-[#145E74] [&:hover:not(:disabled)]:shadow-lg [&:hover:not(:disabled)]:-translate-y-0.5 active:scale-[0.99]"
          >
            <Loader2 className="size-4 hidden" />
            Cadastrar
          </button>

          {/* Mensagem de Erro */}
          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Link para Login */}
          <p className="text-center text-sm text-slate-600 dark:text-zinc-400">
            Já tem conta?{' '}
            <Link to="/login" className="font-semibold text-[#17708A] dark:text-[#1E88A8] underline underline-offset-2 transition-colors">
              Entrar aqui
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
