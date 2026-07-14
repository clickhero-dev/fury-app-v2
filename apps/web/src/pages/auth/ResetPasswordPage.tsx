import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { OtpInput } from '@/components/auth/OtpInput';
import { useResetPassword } from '@/hooks/useResetPassword';
import { useResendOtp } from '@/hooks/useResendOtp';

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
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
        <div className="w-full max-w-[400px] text-center">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#EA580C] mb-4">
              <span className="text-white font-black text-xl">F</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">FURY</h1>
            <p className="text-sm text-gray-400 mt-1">Automação de tráfego pago com IA</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <p className="text-sm text-gray-600 mb-4">
              Acesso inválido. Por favor, inicie o processo de recuperação de senha novamente.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block text-[#EA580C] font-semibold hover:underline"
            >
              Voltar para recuperação
            </Link>
          </div>
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
            <div className="space-y-6">

              {/* Header */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">Redefinir senha</h2>
                <p className="text-sm text-gray-600">
                  Enviamos um código para <span className="font-semibold">{email}</span>
                </p>
              </div>

              {/* OTP Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nova senha
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C] transition-colors"
                    {...register('newPassword')}
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
                {errors.newPassword?.message && (
                  <p className="text-xs text-red-500 mt-1">{errors.newPassword.message}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Confirmar senha
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C] transition-colors"
                    {...register('confirmPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword?.message && (
                  <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message}</p>
                )}
              </div>

            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={resetPasswordMutation.isPending || !isValid || otpValue.length !== 6}
              className="w-full mt-8 bg-[#EA580C] hover:bg-[#D4520B] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {resetPasswordMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Redefinindo...
                </>
              ) : (
                'Redefinir senha'
              )}
            </button>

            {/* Errors */}
            {generalError && (
              <p className="text-sm text-red-500 text-center mt-3">{generalError}</p>
            )}

            {/* Resend Code */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              {resendCountdown > 0 ? (
                <p className="text-sm text-center text-gray-600 font-medium">
                  Reenviar código em {resendCountdown}s
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendOtpMutation.isPending}
                  className="w-full text-sm font-bold text-center transition-all hover:underline"
                  style={{ color: '#EA580C' }}
                >
                  {resendOtpMutation.isPending ? 'Reenviando...' : 'Reenviar código'}
                </button>
              )}
            </div>
          </form>

          {/* Back link */}
          <p className="text-sm text-gray-500 text-center mt-4">
            <Link
              to="/forgot-password"
              className="text-[#EA580C] font-semibold hover:underline"
            >
              Tentar outro email
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
