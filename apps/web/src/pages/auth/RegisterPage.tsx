import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { OtpInput } from '@/components/auth/OtpInput';
import { useRegister } from '@/hooks/useRegister';
import { useVerifyEmail } from '@/hooks/useVerifyEmail';
import { useResendOtp } from '@/hooks/useResendOtp';
import type { RegisterRequest } from '@/types/auth';
import { AdySymbol } from '@/components/AdySymbol';
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import { login as authLogin } from '@/store/slices/authSlice';
import { store } from '@/store';

const registerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  companyName: z.string().min(2, 'Nome da empresa é obrigatório'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

/**
 * Página de cadastro de novos usuários na plataforma ady.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const verifyMutation = useVerifyEmail();
  const resendMutation = useResendOtp();
  const [step, setStep] = useState<1 | 2>(1);
  const [userId, setUserId] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [otpValue, setOtpValue] = useState<string>('');
  const [otpError, setOtpError] = useState<string>('');
  const [resendCountdown, setResendCountdown] = useState<number>(0);
  const [showPassword, setShowPassword] = useState(false);

  // 🔄 DETECÇÃO DO MODO DO NAVEGADOR / SISTEMA
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema as any),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      companyName: '',
    },
  });

  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const onSubmit = async (data: RegisterFormValues) => {
    try {
      setError('');
      const response = await registerMutation.mutateAsync(data as RegisterRequest);
      setUserId(response.user.id);
      setEmail(data.email);
      setStep(2);
      setResendCountdown(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar');
    }
  };

  const handleVerifyOtp = async (code: string) => {
    try {
      setOtpError('');
      const response = await verifyMutation.mutateAsync({
        userId,
        code,
      });
      localStorage.setItem('token', response.token);
      localStorage.setItem('refreshToken', response.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.user));
      navigate('/onboarding/conectar-meta');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Código inválido');
    }
  };

  const handleResendOtp = async () => {
    try {
      setOtpError('');
      await resendMutation.mutateAsync(userId);
      setResendCountdown(30);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Erro ao reenviar código');
    }
  };

  // Estilo padronizado dos inputs com Hover & Focus
  const inputClass =
    'w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-[#12130F] px-4 py-3 text-sm text-slate-900 dark:text-white outline-none transition-all duration-200 placeholder:text-slate-400 dark:placeholder:text-zinc-500 hover:border-[#1E88A8] hover:ring-2 hover:ring-[#1E88A8]/20 hover:bg-white dark:hover:bg-[#12130F] focus:border-[#1E88A8] focus:bg-white dark:focus:bg-[#12130F] focus:ring-2 focus:ring-[#1E88A8]/20';

  // Step 2: OTP Verification
  if (step === 2) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[#f3f6f8] dark:bg-[#0c0d0a] px-5 py-16 text-slate-900 dark:text-white transition-colors duration-300 overflow-hidden">
        
        {/* 🌌 GRID DE FUNDO */}
        <div 
          aria-hidden 
          className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
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

          {/* Card do OTP */}
          <div className="mt-8 space-y-6 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#181915] p-7 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">Verificar email</h2>
              <p className="text-sm text-slate-600 dark:text-zinc-400">
                Enviamos um código para <span className="font-semibold text-slate-900 dark:text-white">{email}</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-2">
                Código de verificação
              </label>
              <OtpInput
                length={6}
                value={otpValue}
                onChange={setOtpValue}
                onComplete={handleVerifyOtp}
                disabled={verifyMutation.isPending}
                error={otpError}
              />
            </div>

            <button
              type="button"
              disabled={verifyMutation.isPending || otpValue.length !== 6}
              onClick={() => handleVerifyOtp(otpValue)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E88A8] py-3 text-sm font-semibold text-white shadow-md shadow-[#1E88A8]/20 transition-all duration-200 [&:hover:not(:disabled)]:!bg-[#17708A] [&:hover:not(:disabled)]:shadow-lg [&:hover:not(:disabled)]:-translate-y-0.5 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {verifyMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Verificar código'
              )}
            </button>

            <div className="pt-4 border-t border-slate-200 dark:border-white/10">
              {resendCountdown > 0 ? (
                <p className="text-sm text-center text-slate-500 dark:text-zinc-400 font-medium">
                  Reenviar código em {resendCountdown}s
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendMutation.isPending}
                  className="w-full text-sm font-semibold text-center text-[#1E88A8] hover:text-[#17708A] hover:underline transition-all"
                >
                  {resendMutation.isPending ? 'Reenviando...' : 'Reenviar código'}
                </button>
              )}
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setOtpValue('');
                  setOtpError('');
                }}
                className="text-sm text-slate-600 dark:text-zinc-400 font-semibold hover:underline transition-all"
              >
                Voltar para cadastro
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Registration Form
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f3f6f8] dark:bg-[#0c0d0a] px-5 py-16 text-slate-900 dark:text-white transition-colors duration-300 overflow-hidden">
      
      {/* 🌌 GRID DE FUNDO */}
      <div 
        aria-hidden 
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
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

        {/* Card do Formulário */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="mt-8 space-y-4 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#181915] p-7 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all"
        >
          <div className="space-y-1 mb-2">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Criar conta</h2>
            <p className="text-sm text-slate-600 dark:text-zinc-400">Comece a automatizar campanhas com ady</p>
          </div>

          {/* Nome Completo */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-zinc-300">Nome Completo</span>
            <input
              type="text"
              placeholder="Seu nome completo"
              autoComplete="name"
              className={inputClass}
              {...register('name')}
            />
            {errors.name?.message && (
              <span className="mt-1 block text-xs font-medium text-red-500">{errors.name.message}</span>
            )}
          </label>

          {/* Email */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-zinc-300">E-mail</span>
            <input
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              className={inputClass}
              {...register('email')}
            />
            {errors.email?.message && (
              <span className="mt-1 block text-xs font-medium text-red-500">{errors.email.message}</span>
            )}
          </label>

          {/* Senha com Visualização Toggle */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-zinc-300">Senha</span>
            <span className="relative block">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
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
              <span className="mt-1 block text-xs font-medium text-red-500">{errors.password.message}</span>
            )}
          </label>

          {/* Empresa */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-zinc-300">Empresa</span>
            <input
              type="text"
              placeholder="Nome da sua empresa"
              autoComplete="organization"
              className={inputClass}
              {...register('companyName')}
            />
            {errors.companyName?.message && (
              <span className="mt-1 block text-xs font-medium text-red-500">{errors.companyName.message}</span>
            )}
          </label>

          {/* Mensagem de Erro de Submissão */}
          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Botão de Envio com Hover e Animação */}
          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E88A8] py-3 text-sm font-semibold text-white shadow-md shadow-[#1E88A8]/20 transition-all duration-200 [&:hover:not(:disabled)]:!bg-[#17708A] [&:hover:not(:disabled)]:shadow-lg [&:hover:not(:disabled)]:-translate-y-0.5 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed !mt-6"
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Criando conta...
              </>
            ) : (
              'Criar conta ady'
            )}
          </button>

          {/* Divisor */}
          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-slate-200 dark:border-white/10" />
            <span className="absolute px-3 text-xs text-slate-400 dark:text-zinc-500 bg-white dark:bg-[#181915]">ou</span>
          </div>

          <GoogleLoginButton
            onSuccess={(data) => {
              localStorage.setItem('token', data.token);
              localStorage.setItem('refreshToken', data.refreshToken);
              localStorage.setItem('user', JSON.stringify(data.user));
              store.dispatch(authLogin({
                token: data.token,
                refreshToken: data.refreshToken,
                name: data.user.name,
                email: data.user.email,
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

          {/* Link para Login */}
          <p className="text-center text-sm text-slate-600 dark:text-zinc-400">
            Já tem conta?{' '}
            <Link to="/login" className="font-semibold text-[#1E88A8] hover:underline transition-colors">
              Entrar aqui
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}