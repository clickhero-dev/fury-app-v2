import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useLogin } from '@/hooks/useLogin';

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

/** Símbolo ady — "A" abstrato com barra + spark laranja. */
 import { AdySymbol } from '@/components/AdySymbol';

export function LoginPage() {
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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

  const inputClass =
    'w-full rounded-lg border border-white/15 bg-admin-bg px-4 py-3 text-sm text-admin-text outline-none transition-colors placeholder:text-admin-text-faint focus:border-admin-petrol';

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-admin-bg px-5 py-16 text-admin-text">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% -10%, rgba(30,136,168,0.16), transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-[400px]">
        <div className="flex flex-col items-center text-center">
          <AdySymbol size={52} />
          <h1 className="mt-5 text-4xl font-medium !text-[#ECEDEF]">ady</h1>
          <p className="!mt-6 text-sm text-admin-text-muted">Seu gestor de tráfego com IA</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-10 space-y-5 rounded-2xl border border-white/10 bg-admin-surface p-7 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]"
        >
          <label className="block">
            <span className="mb-2 block text-sm text-admin-text-muted">E-mail</span>
            <input
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              className={inputClass}
              {...register('email')}
            />
            {errors.email?.message && (
              <span className="mt-2 block text-xs text-admin-danger">{errors.email.message}</span>
            )}
          </label>

          <label className="block">
            <span className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm text-admin-text-muted">Senha</span>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-admin-petrol hover:underline"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-admin-text-faint transition-colors hover:text-admin-text"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
            {errors.password?.message && (
              <span className="mt-2 block text-xs text-admin-danger">{errors.password.message}</span>
            )}
          </label>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-admin-petrol py-3 text-sm font-semibold text-admin-bg transition-opacity hover:opacity-90 disabled:opacity-60"
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

          {error && (
            <p className="rounded-lg border border-admin-danger/25 bg-admin-danger/10 px-4 py-3 text-center text-xs text-admin-danger">
              {error}
            </p>
          )}

          <p className="text-center text-sm text-admin-text-muted">
            Não tem conta?{' '}
            <Link to="/cadastro" className="font-medium text-admin-petrol hover:underline">
              Criar conta gratuita
            </Link>
          </p>
        </form>

        <p className="!mt-10 text-center text-xs text-admin-text-faint">ady é um produto <span className="text-[#CF6F03]">Click Hero</span></p>
      </div>
    </div>
  );
}