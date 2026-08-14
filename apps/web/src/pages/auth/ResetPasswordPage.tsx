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

  if (!email) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-admin-bg px-5 py-16 text-admin-text">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(120% 90% at 50% -10%, rgba(30,136,168,0.16), transparent 70%)',
          }}
        />

        <div className="relative w-full max-w-[400px]">
          <div className="flex flex-col items-center text-center">
            <AdySymbol size={52} />
            <h1 className="mt-5 text-4xl font-medium !text-[#ECEDEF]">ady</h1>
            <p className="!mt-6 text-sm text-admin-text-muted">Seu gestor de tráfego com IA</p>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-admin-surface p-7 text-center shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]">
            <p className="mb-6 text-sm text-admin-text-muted">
              Acesso inválido. Por favor, inicie o processo de recuperação de senha novamente.
            </p>
            <Link
              to="/forgot-password"
              className="font-medium text-admin-petrol hover:underline text-sm"
            >
              Voltar para recuperação
            </Link>
          </div>

          <p className="!mt-10 text-center text-xs text-admin-text-faint">
            ady é um produto <span className="text-[#CF6F03]">Click Hero</span>
          </p>
        </div>
      </div>
    );
  }

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

        {/* Card do Formulário */}
        <form
          className="mt-10 space-y-5 rounded-2xl border border-white/10 bg-admin-surface p-7 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold !text-[#ECEDEF]">Redefinir senha</h2>
            <p className="text-sm text-admin-text-muted">
              Enviamos um código para <strong className="text-admin-text">{email}</strong>
            </p>
          </div>

          {/* OTP Input */}
          <div>
            <label className="mb-2 block text-sm text-admin-text-muted">
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

          {/* New Password */}
          <div>
            <label className="mb-2 block text-sm text-admin-text-muted">
              Nova senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="w-full rounded-lg border border-white/15 bg-admin-bg px-4 py-3 pr-11 text-sm text-admin-text outline-none transition-colors placeholder:text-admin-text-faint focus:border-admin-petrol"
                {...register('newPassword')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-admin-text-faint hover:text-admin-text transition-colors"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.newPassword?.message && (
              <p className="mt-2 text-sm text-admin-danger">{errors.newPassword.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="mb-2 block text-sm text-admin-text-muted">
              Confirmar senha
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="w-full rounded-lg border border-white/15 bg-admin-bg px-4 py-3 pr-11 text-sm text-admin-text outline-none transition-colors placeholder:text-admin-text-faint focus:border-admin-petrol"
                {...register('confirmPassword')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-admin-text-faint hover:text-admin-text transition-colors"
                aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.confirmPassword?.message && (
              <p className="mt-2 text-sm text-admin-danger">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={resetPasswordMutation.isPending || !isValid || otpValue.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-admin-petrol py-3 text-sm font-semibold text-admin-bg transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
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

          {/* Errors */}
          {generalError && (
            <p className="text-center text-sm text-admin-danger">{generalError}</p>
          )}

          {/* Resend Code */}
          <div className="mt-6 pt-5 border-t border-white/10">
            {resendCountdown > 0 ? (
              <p className="text-sm text-center text-admin-text-muted">
                Reenviar código em {resendCountdown}s
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendOtpMutation.isPending}
                className="w-full text-sm font-medium text-admin-petrol transition-colors hover:underline"
              >
                {resendOtpMutation.isPending ? 'Reenviando...' : 'Reenviar código'}
              </button>
            )}
          </div>

          {/* Link para trocar e-mail */}
          <p className="text-center text-sm text-admin-text-muted">
            <Link to="/forgot-password" className="font-medium text-admin-petrol hover:underline">
              Tentar outro email
            </Link>
          </p>
        </form>

        {/* Rodapé */}
        <p className="!mt-10 text-center text-xs text-admin-text-faint">
          ady é um produto <span className="text-[#CF6F03]">Click Hero</span>
        </p>
      </div>
    </div>
  );
}