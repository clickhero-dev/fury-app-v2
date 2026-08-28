import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useLogin } from '@/hooks/useLogin';
import { AdySymbol } from '@/components/AdySymbol';
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import { login as authLogin } from '@/store/slices/authSlice';
import { store } from '@/store';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function getFriendlyError(err: unknown): string {
  if (isAxiosError(err)) {
    if (err.response?.status === 401) {
      return 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.';
    }
    if (!err.response || err.code === 'ERR_NETWORK') {
      return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.';
    }
  }
  return 'Ocorreu um erro inesperado. Tente novamente em alguns instantes.';
}

export function LoginPage() {
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Handle social login redirect
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
        navigate('/dashboard');
        return;
      } catch {
        setError('Erro ao fazer login com Google');
      }
    }

    }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema as any),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      setError('');
      await loginMutation.mutateAsync({ email: data.email, password: data.password });
      navigate('/dashboard');
    } catch (err) {
      setError(getFriendlyError(err));
    }
  };

  // Classe dos inputs atualizada com HOVER
  const inputClass =
  'w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-[#12130F] px-4 py-3 text-sm text-slate-900 dark:text-white outline-none transition-all duration-200 placeholder:text-slate-400 dark:placeholder:text-zinc-500 hover:border-[#1E88A8] hover:ring-2 hover:ring-[#1E88A8]/20 hover:bg-white dark:hover:bg-[#12130F] focus:border-[#1E88A8] focus:bg-white dark:focus:bg-[#12130F] focus:ring-2 focus:ring-[#1E88A8]/20';

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
        {/* Cabeçalho */}
        <div className="flex flex-col items-center text-center">
          <div className="p-2">
            <AdySymbol size={52} />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">ady</h1>
          <p className="!mt-1.5 text-sm font-medium text-slate-500 dark:text-zinc-400">Seu gestor de tráfego com IA</p>
        </div>

        {/* Card do Formulário */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-8 space-y-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#181915] p-7 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-zinc-300">E-mail</span>
            <input
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              className={inputClass}
              {...register('email')}
            />
            {errors.email?.message && (
              <span className="mt-2 block text-xs font-medium text-red-500">{errors.email.message}</span>
            )}
          </label>

          <label className="block">
            <span className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">Senha</span>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-[#17708A] dark:text-[#1E88A8] dark:hover:text-[#17708A] hover:underline transition-colors"
              >
                Esqueci a senha
              </Link>
            </span>
            <span className="relative block">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                className={`${inputClass} pr-11`}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
            {errors.password?.message && (
              <span className="mt-2 block text-xs font-medium text-red-500">{errors.password.message}</span>
            )}
          </label>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#17708A] py-3 text-sm font-semibold text-white shadow-md shadow-[#17708A]/20 transition-all duration-200 [&:hover:not(:disabled)]:!bg-[#145E74] [&:hover:not(:disabled)]:shadow-lg [&:hover:not(:disabled)]:-translate-y-0.5 active:scale-[0.99] disabled:opacity-60"
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </button>

          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-slate-200 dark:border-white/10" />
            <span className="absolute px-3 text-xs text-slate-400 dark:text-zinc-500 bg-white dark:bg-[#181915]">ou</span>
          </div>

          <GoogleLoginButton
            label="Entrar com Google"
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
              navigate('/dashboard');
            }}
            onError={(msg) => setError(msg)}
          />

          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <p className="text-center text-sm text-slate-600 dark:text-zinc-400">
            Não tem conta?{' '}
            <Link to="/cadastro" className="font-semibold text-[#17708A] dark:text-[#1E88A8] underline underline-offset-2 transition-colors">
              Criar conta gratuita
            </Link>
          </p>
        </form>

        {/* Rodapé com Link para Click Hero */}
        <p className="!mt-8 text-center text-xs text-slate-500 dark:text-zinc-500">
          <span className="font-semibold text-slate-700 dark:text-zinc-300">Ady</span> é um produto{' '}
          <a
            href="https://www.clickhero.com.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#f97316] hover:text-[#ea580c] underline underline-offset-2 transition-colors"
          >
            Click Hero
          </a>
        </p>
      </div>
    </div>
  );
}