import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useLogin } from '@/hooks/useLogin';
import { DEMO_CREDENTIALS } from '@/lib/constants';

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
  const [error, setError] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
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

  const fillDemo = () => {
    setValue('email', DEMO_CREDENTIALS.email, { shouldValidate: false });
    setValue('password', DEMO_CREDENTIALS.password, { shouldValidate: false });
    setError('');
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">

        {/* Logo + tagline */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#EA580C] mb-4">
            <span className="text-white font-black text-xl">F</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">FURY</h1>
          <p className="text-sm text-gray-400 mt-1">Automação de tráfego pago com IA</p>
        </div>

        {/* Form card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-4">

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  E-mail
                </label>
                <input
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C] transition-colors"
                  {...register('email')}
                />
                {errors.email?.message && (
                  <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C] transition-colors"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                   {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password?.message && (
                  <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
                )}
              </div>

            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full mt-6 bg-[#EA580C] hover:bg-[#D4520B] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 text-center mt-3">{error}</p>
            )}
          </form>

          {/* Sign up link */}
          <p className="text-sm text-gray-500 text-center mt-4">
            Não tem conta?{' '}
            <Link
              to="/cadastro"
              className="text-[#EA580C] font-semibold hover:underline"
            >
              Criar conta gratuita
            </Link>
          </p>
        </div>

        {/* Demo credentials */}
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Credenciais Demo
            </span>
            <span className="bg-[#EA580C] text-white text-xs px-2 py-0.5 rounded-full font-semibold">
              DEMO
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500 shrink-0">Email:</span>
              <code className="font-mono text-xs bg-white border border-gray-200 rounded px-2 py-1 text-gray-700 truncate">
                {DEMO_CREDENTIALS.email}
              </code>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500 shrink-0">Senha:</span>
              <code className="font-mono text-xs bg-white border border-gray-200 rounded px-2 py-1 text-gray-700">
                {DEMO_CREDENTIALS.password}
              </code>
            </div>
          </div>
          <button
            type="button"
            onClick={fillDemo}
            className="mt-3 text-xs text-[#EA580C] underline cursor-pointer hover:text-[#D4520B] transition-colors"
          >
            Preencher automaticamente
          </button>
        </div>

      </div>
    </div>
  );
}
