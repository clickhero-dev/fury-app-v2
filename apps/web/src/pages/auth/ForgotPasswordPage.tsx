import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Mail } from 'lucide-react';
import { useForgotPassword } from '@/hooks/useForgotPassword';
import type { ForgotPasswordRequest } from '@/types/auth';
import { AdySymbol } from '@/components/AdySymbol';

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

          <div className="mt-10 space-y-5 rounded-2xl border border-white/10 bg-admin-surface p-7 text-center shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-admin-petrol/12 text-admin-petrol">
              <Mail className="size-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-semibold !text-[#ECEDEF]">Email enviado</h2>
              <p className="text-sm text-admin-text-muted">
                Se o email <strong className="text-admin-text">{successEmail}</strong> existir em nossa base, você receberá um código de recuperação.
              </p>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              className="w-full rounded-lg bg-admin-petrol py-3 text-sm font-semibold text-admin-bg transition-opacity hover:opacity-90"
            >
              Continuar
            </button>

            <button
              type="button"
              onClick={() => setShowSuccess(false)}
              className="w-full text-sm font-medium text-admin-petrol transition-colors hover:underline"
            >
              Tentar outro email
            </button>
          </div>

          <p className="!mt-10 text-center text-xs text-admin-text-faint">
            ady é um produto <span className="text-[#CF6F03]">Click Hero</span>
          </p>
        </div>
      </div>
    );
  }

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

        <form
          className="mt-10 space-y-5 rounded-2xl border border-white/10 bg-admin-surface p-7 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]"
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold !text-[#ECEDEF]">Recuperar senha</h2>
            <p className="text-sm text-admin-text-muted">
              Digite seu email para receber um código de recuperação.
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm text-admin-text-muted">E-mail</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              className="w-full rounded-lg border border-white/15 bg-admin-bg px-4 py-3 text-sm text-admin-text outline-none transition-colors placeholder:text-admin-text-faint focus:border-admin-petrol"
              {...register('email')}
            />
            {errors.email?.message && (
              <p className="mt-2 text-sm text-admin-danger">{errors.email.message}</p>
            )}
          </label>

          <button
            type="submit"
            disabled={forgotPasswordMutation.isPending || !isValid}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-admin-petrol py-3 text-sm font-semibold text-admin-bg transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {forgotPasswordMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Processando...
              </>
            ) : (
              'Enviar código'
            )}
          </button>

          {error && <p className="text-center text-sm text-admin-danger">{error}</p>}

          <p className="text-center text-sm text-admin-text-muted">
            Lembrou a senha?{' '}
            <Link to="/" className="font-medium text-admin-petrol hover:underline">
              Entrar
            </Link>
          </p>
        </form>

        <p className="!mt-10 text-center text-xs text-admin-text-faint">
          ady é um produto <span className="text-[#CF6F03]">Click Hero</span>
        </p>
      </div>
    </div>
  );
}