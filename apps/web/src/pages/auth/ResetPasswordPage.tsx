import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { OtpInput } from '@/components/auth/OtpInput';
import { useResetPassword } from '@/hooks/useResetPassword';
import { useResendOtp } from '@/hooks/useResendOtp';
import { AdySymbol } from '@/components/AdySymbol';

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'As senhas não conferem',
  path: ['confirmPassword'],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as { email?: string })?.email || '';

  const resetPasswordMutation = useResetPassword();
  const resendOtpMutation = useResendOtp();

  const [otpValue, setOtpValue] = useState<string>('');
  const [otpError, setOtpError] = useState<string>('');
  const [generalError, setGeneralError] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendCountdown, setResendCountdown] = useState<number>(0);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema as any),
    mode: 'onChange',
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const onSubmit = async (data: ResetPasswordFormValues) => {
    if (otpValue.length !== 6) {
      setOtpError('Código deve ter 6 dígitos');
      return;
    }

    try {
      setOtpError('');
      setGeneralError('');
      await resetPasswordMutation.mutateAsync({
        email,
        code: otpValue,
        newPassword: data.newPassword,
      });
      navigate('/reset-password/success');
    } catch (err) {
      if (err instanceof Error && err.message.includes('Código')) {
        setOtpError(err.message);
      } else {
        setGeneralError(err instanceof Error ? err.message : 'Erro ao redefinir senha');
      }
    }
  };

  const handleResendOtp = async () => {
    try {
      setOtpError('');
      await resendOtpMutation.mutateAsync(email);
      setResendCountdown(30);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Erro ao reenviar código');
    }
  };

  const handleVerifyOtp = async (code: string) => {
    if (code.length === 6) {
      handleSubmit(onSubmit)();
    }
  };

  // Estilo padronizado dos inputs com Hover e Focus
  const inputClass =
    'w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-[#12130F] px-4 py-3 text-sm text-slate-900 dark:text-white outline-none transition-all duration-200 placeholder:text-slate-400 dark:placeholder:text-zinc-500 hover:border-[#1E88A8] hover:ring-2 hover:ring-[#1E88A8]/20 hover:bg-white dark:hover:bg-[#12130F] focus:border-[#1E88A8] focus:bg-white dark:focus:bg-[#12130F] focus:ring-2 focus:ring-[#1E88A8]/20';

  // Se o e-mail não for informado
  if (!email) {
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

          <div className="mt-8 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#181915] p-7 text-center shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md">
            <p className="mb-6 text-sm text-slate-600 dark:text-zinc-400">
              Acesso inválido. Por favor, inicie o processo de recuperação de senha novamente.
            </p>
            <Link
              to="/forgot-password"
              className="font-semibold text-[#1E88A8] hover:underline text-sm transition-colors"
            >
              Voltar para recuperação
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
          className="mt-8 space-y-4 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#181915] p-7 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div className="space-y-1 mb-2">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Redefinir senha</h2>
            <p className="text-sm text-slate-600 dark:text-zinc-400">
              Enviamos um código para <strong className="text-slate-900 dark:text-white">{email}</strong>
            </p>
          </div>

          {/* OTP Input */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-zinc-300">
              Código de recuperação
            </label>
            <OtpInput
              length={6}
              value={otpValue}
              onChange={setOtpValue}
              onComplete={handleVerifyOtp}
              disabled={resetPasswordMutation.isPending}
              error={otpError}
            />
          </div>

          {/* Nova Senha */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-zinc-300">Nova senha</span>
            <span className="relative block">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mínimo 8 caracteres"
                className={`${inputClass} pr-11`}
                {...register('newPassword')}
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
            {errors.newPassword?.message && (
              <span className="mt-1 block text-xs font-medium text-red-500">{errors.newPassword.message}</span>
            )}
          </label>

          {/* Confirmar Senha */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-zinc-300">Confirmar senha</span>
            <span className="relative block">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirme sua nova senha"
                className={`${inputClass} pr-11`}
                {...register('confirmPassword')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-white transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
            {errors.confirmPassword?.message && (
              <span className="mt-1 block text-xs font-medium text-red-500">{errors.confirmPassword.message}</span>
            )}
          </label>

          {/* Mensagem de Erro Geral */}
          {generalError && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs font-medium text-red-600 dark:text-red-400">
              {generalError}
            </p>
          )}

          {/* Botão de Redefinir */}
          <button
            type="submit"
            disabled={resetPasswordMutation.isPending || !isValid || otpValue.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E88A8] py-3 text-sm font-semibold text-white shadow-md shadow-[#1E88A8]/20 transition-all duration-200 [&:hover:not(:disabled)]:!bg-[#17708A] [&:hover:not(:disabled)]:shadow-lg [&:hover:not(:disabled)]:-translate-y-0.5 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed !mt-6"
          >
            {resetPasswordMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Redefinindo...
              </>
            ) : (
              'Redefinir senha'
            )}
          </button>

          {/* Reenviar Código */}
          <div className="pt-4 border-t border-slate-200 dark:border-white/10">
            {resendCountdown > 0 ? (
              <p className="text-sm text-center text-slate-500 dark:text-zinc-400 font-medium">
                Reenviar código em {resendCountdown}s
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendOtpMutation.isPending}
                className="w-full text-sm font-semibold text-center text-[#1E88A8] hover:text-[#17708A] hover:underline transition-all"
              >
                {resendOtpMutation.isPending ? 'Reenviando...' : 'Reenviar código'}
              </button>
            )}
          </div>

          {/* Link para trocar e-mail */}
          <p className="text-center text-sm text-slate-600 dark:text-zinc-400">
            <Link to="/forgot-password" className="font-semibold text-[#1E88A8] hover:underline transition-colors">
              Tentar outro email
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}