import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useForgotPassword } from '@/hooks/useForgotPassword';
import type { ForgotPasswordRequest } from '@/types/auth';

const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido').nonempty('Email é obrigatório'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const forgotPasswordMutation = useForgotPassword();
  const [error, setError] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string>('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema as any),
    mode: 'onChange',
    defaultValues: { email: '' },
  });

  const email = watch('email');

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    try {
      setError('');
      await forgotPasswordMutation.mutateAsync(data as ForgotPasswordRequest);
      setSuccessEmail(data.email);
      setShowSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar solicitação');
    }
  };

  const handleContinue = () => {
    navigate('/reset-password', { state: { email: successEmail } });
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#EA580C] mb-4">
              <span className="text-white font-black text-xl">F</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">FURY</h1>
            <p className="text-sm text-gray-400 mt-1">Automação de tráfego pago com IA</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-2">Email enviado</h2>
                <p className="text-sm text-gray-600">
                  Se o email <span className="font-semibold text-gray-900">{successEmail}</span> existir em nossa base, você receberá um código de recuperação.
                </p>
              </div>

              <button
                type="button"
                onClick={handleContinue}
                className="w-full bg-[#EA580C] hover:bg-[#D4520B] text-white font-bold py-3 rounded-xl text-sm transition-colors"
              >
                Continuar
              </button>

              <button
                type="button"
                onClick={() => setShowSuccess(false)}
                className="w-full text-sm font-bold text-center transition-all hover:underline"
                style={{ color: '#EA580C' }}
              >
                Tentar outro email
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
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
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">Recuperar senha</h2>
                <p className="text-sm text-gray-600 mb-6">
                  Digite seu email para receber um código de recuperação
                </p>
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
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={forgotPasswordMutation.isPending || !isValid}
              className="w-full mt-6 bg-[#EA580C] hover:bg-[#D4520B] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              {forgotPasswordMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                'Enviar código'
              )}
            </button>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 text-center mt-3">{error}</p>
            )}
          </form>

          {/* Back link */}
          <p className="text-sm text-gray-500 text-center mt-4">
            Lembrou a senha?{' '}
            <Link
              to="/login"
              className="text-[#EA580C] font-semibold hover:underline"
            >
              Entrar
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}