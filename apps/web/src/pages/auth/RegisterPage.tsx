import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
import { AuthLayout } from '@/components/AuthLayout';
import { OtpInput } from '@/components/auth/OtpInput';
import { useRegister } from '@/hooks/useRegister';
import { useVerifyEmail } from '@/hooks/useVerifyEmail';
import { useResendOtp } from '@/hooks/useResendOtp';
import type { RegisterRequest } from '@/types/auth';
import { FURY_COLORS } from '@/lib/constants';

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
 * - O layout é fornecido por `AuthLayout`, compartilhado com `LoginPage`
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

  if (step === 2) {
    return (
      <AuthLayout>
        <div className="space-y-10">
          {/* Header */}
          <div className="space-y-3">
            <h2 className="text-3xl font-black text-[#1C1C1E]">Verificar email</h2>
            <p className="text-lg text-[#6E7681] font-medium">
              Enviamos um código para <span className="font-bold text-[#1C1C1E]">{email}</span>
            </p>
          </div>

          {/* OTP Input */}
          <div className="space-y-6">
            <OtpInput
              length={6}
              value={otpValue}
              onChange={setOtpValue}
              onComplete={handleVerifyOtp}
              disabled={verifyMutation.isPending}
              error={otpError}
            />

            {otpError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-sm font-semibold text-red-800">{otpError}</p>
              </div>
            )}

            <div className="space-y-3">
              <Button
                type="button"
                variant="primary"
                size="md"
                className="w-full"
                disabled={verifyMutation.isPending || otpValue.length !== 6}
                onClick={() => handleVerifyOtp(otpValue)}
                aria-busy={verifyMutation.isPending}
              >
                {verifyMutation.isPending ? 'Verificando...' : 'Verificar código'}
              </Button>

              {resendCountdown > 0 ? (
                <p className="text-sm text-center text-[#6E7681] font-medium">
                  Reenviar código em {resendCountdown}s
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendMutation.isPending}
                  className="w-full text-sm font-bold text-center transition-all hover:underline"
                  style={{ color: FURY_COLORS.primary }}
                >
                  {resendMutation.isPending ? 'Reenviando...' : 'Reenviar código'}
                </button>
              )}
            </div>
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
              className="text-[#6E7681] text-sm font-bold hover:underline transition-all"
            >
              Voltar para cadastro
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-10">
        {/* Header */}
        <div className="space-y-3">
          <h2 className="text-3xl font-black text-[#1C1C1E]">Criar conta</h2>
          <p className="text-lg text-[#6E7681] font-medium">Comece a automatizar campanhas com FURY</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            label="Nome Completo"
            placeholder="Seu nome completo"
            error={errors.name?.message}
            {...register('name')}
          />

          <FormField
            label="Email"
            placeholder="seu@email.com"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <FormField
            label="Senha"
            placeholder="Mínimo 8 caracteres"
            type="password"
            error={errors.password?.message}
            {...register('password')}
          />

          <FormField
            label="Empresa"
            placeholder="Nome da sua empresa"
            error={errors.companyName?.message}
            {...register('companyName')}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-semibold text-red-800">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            className="w-full"
            disabled={registerMutation.isPending}
            aria-busy={registerMutation.isPending}
          >
            {registerMutation.isPending ? 'Criando conta...' : 'Criar conta FURY'}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E0E0E0]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-3 bg-white text-[#6E7681]">ou</span>
          </div>
        </div>

        {/* Sign In Link */}
        <div className="text-center">
          <p className="text-[#6E7681] text-sm">
            Já tem conta?{' '}
            <Link
              to="/login"
              className="font-bold hover:underline transition-all"
              style={{ color: FURY_COLORS.primary }}
            >
              Entrar aqui
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}