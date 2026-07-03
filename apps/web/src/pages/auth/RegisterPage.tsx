import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { OtpInput } from '@/components/auth/OtpInput';
import { useRegister } from '@/hooks/useRegister';
import { useVerifyEmail } from '@/hooks/useVerifyEmail';
import { useResendOtp } from '@/hooks/useResendOtp';
import type { RegisterRequest } from '@/types/auth';

const registerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  companyName: z.string().min(2, 'Nome da empresa é obrigatório'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

/**
 * Página de cadastro de novos usuários na plataforma FURY.
 *
 * Exibe um formulário com validação via Zod + React Hook Form coletando
 * nome, e-mail, senha e empresa. Em caso de sucesso, redireciona para
 * o fluxo de onboarding em `/onboarding/conectar-meta`.
 *
 * @remarks
 * - Utiliza `useRegister` para executar a mutation de criação de conta
 * - Step 1: formulário de cadastro
 * - Step 2: verificação de email via OTP
 * - O cast `data as RegisterRequest` é necessário por limitação de inferência
 *   do Zod + RHF no TypeScript 5.6, onde campos obrigatórios são inferidos
 *   como opcionais
 *
 * @example
 * // Registrada na rota pública `/cadastro`
 * <Route path="/cadastro" element={<RegisterPage />} />
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
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

  // Step 2: OTP Verification
  if (step === 2) {
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

          {/* Card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="space-y-6">

              {/* Header */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">Verificar email</h2>
                <p className="text-sm text-gray-600">
                  Enviamos um código para <span className="font-semibold text-gray-900">{email}</span>
                </p>
              </div>

              {/* OTP Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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

              {/* Verify Button */}
              <button
                type="button"
                disabled={verifyMutation.isPending || otpValue.length !== 6}
                onClick={() => handleVerifyOtp(otpValue)}
                className="w-full bg-[#EA580C] hover:bg-[#D4520B] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                {verifyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Verificar código'
                )}
              </button>

              {/* Resend Code */}
              <div className="pt-4 border-t border-gray-200">
                {resendCountdown > 0 ? (
                  <p className="text-sm text-center text-gray-600 font-medium">
                    Reenviar código em {resendCountdown}s
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendMutation.isPending}
                    className="w-full text-sm font-bold text-center transition-all hover:underline"
                    style={{ color: '#EA580C' }}
                  >
                    {resendMutation.isPending ? 'Reenviando...' : 'Reenviar código'}
                  </button>
                )}
              </div>

              {/* Back Link */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setOtpValue('');
                    setOtpError('');
                  }}
                  className="text-sm text-gray-600 font-semibold hover:underline transition-all"
                >
                  Voltar para cadastro
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Step 1: Registration Form
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

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="space-y-4">

              {/* Header */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Criar conta</h2>
                <p className="text-sm text-gray-600">Comece a automatizar campanhas com FURY</p>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nome Completo
                </label>
                <input
                  type="text"
                  placeholder="Seu nome completo"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C] transition-colors"
                  {...register('name')}
                />
                {errors.name?.message && (
                  <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
                )}
              </div>

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
                <input
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C] transition-colors"
                  {...register('password')}
                />
                {errors.password?.message && (
                  <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
                )}
              </div>

              {/* Company */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Empresa
                </label>
                <input
                  type="text"
                  placeholder="Nome da sua empresa"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C] transition-colors"
                  {...register('companyName')}
                />
                {errors.companyName?.message && (
                  <p className="text-xs text-red-500 mt-1">{errors.companyName.message}</p>
                )}
              </div>

            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 text-center mt-4">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full mt-6 bg-[#EA580C] hover:bg-[#D4520B] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Criar conta FURY'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-white text-gray-600">ou</span>
            </div>
          </div>

          {/* Sign In Link */}
          <p className="text-sm text-gray-600 text-center">
            Já tem conta?{' '}
            <Link
              to="/login"
              className="text-[#EA580C] font-semibold hover:underline transition-all"
            >
              Entrar aqui
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
