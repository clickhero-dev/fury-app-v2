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

  const inputClass =
    'w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-[#12130F] px-4 py-3 text-sm text-slate-900 dark:text-white outline-none transition-all duration-200 placeholder:text-slate-400 dark:placeholder:text-zinc-500 hover:border-[#1E88A8] hover:ring-2 hover:ring-[#1E88A8]/20 hover:bg-white dark:hover:bg-[#12130F] focus:border-[#1E88A8] focus:bg-white dark:focus:bg-[#12130F] focus:ring-2 focus:ring-[#1E88A8]/20';

    if (showSuccess) {
      return (
        <div className="relative flex min-h-screen items-center justify-center bg-[#f3f6f8] dark:bg-[#0c0d0a] px-5 py-16 text-slate-900 dark:text-white transition-colors duration-300 overflow-hidden">
          {/* Grid de Fundo */}
          <div 
            aria-hidden 
            className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
            style={{
              backgroundImage: `radial-gradient(#1E88A8 1px, transparent 1px)`,
              backgroundSize: '24px 24px'
            }}
          />
          {/* Glow Radial */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% -10%, rgba(30, 136, 168, 0.22) 0%, transparent 60%)`,
            }}
          />
    
          <div className="relative z-10 w-full max-w-[400px]">
            {/* Cabeçalho / Logo */}
            <div className="flex flex-col items-center text-center">
              <div className="p-2">
                <AdySymbol size={52} />
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">ady</h1>
              <p className="!mt-1.5 text-sm font-medium text-slate-500 dark:text-zinc-400">Seu gestor de tráfego com IA</p>
            </div>
    
            {/* Card de Sucesso */}
            <div className="mt-8 space-y-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#181915] p-7 text-center shadow-xl dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md">
              {/* Ícone */}
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#1E88A8]/10 dark:bg-[#1E88A8]/20 text-[#1E88A8]">
                <Mail className="size-6 text-[#1E88A8]" />
              </div>
    
              {/* Texto */}
              <div className="space-y-1.5">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Email enviado</h2>
                <p className="text-sm text-slate-600 dark:text-zinc-400">
                  Se o email <strong className="font-semibold text-slate-900 dark:text-white">{successEmail}</strong> existir em nossa base, você receberá um código de recuperação.
                </p>
              </div>
    
              {/* Botão Continuar */}
              <button
                type="button"
                onClick={handleContinue}
                className="w-full rounded-xl bg-[#1E88A8] py-3 text-sm font-semibold text-white shadow-md shadow-[#1E88A8]/20 transition-all hover:bg-[#17708A] hover:-translate-y-0.5 active:scale-[0.99]"
              >
                Continuar
              </button>
    
              {/* Botão Tentar Outro Email */}
              <button
                type="button"
                onClick={() => setShowSuccess(false)}
                className="w-full text-sm font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Tentar outro email
              </button>
            </div>
          </div>
        </div>
      );
    }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f3f6f8] dark:bg-[#0c0d0a] px-5 py-16 text-slate-900 dark:text-white transition-colors duration-300 overflow-hidden">
      <div 
        aria-hidden 
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(#1E88A8 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% -10%, rgba(30, 136, 168, 0.22) 0%, transparent 60%)`,
        }}
      />

      <div className="relative z-10 w-full max-w-[400px]">
        <div className="flex flex-col items-center text-center">
          <div className="p-2">
            <AdySymbol size={52} />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">ady</h1>
          <p className="!mt-1.5 text-sm font-medium text-slate-500 dark:text-zinc-400">Seu gestor de tráfego com IA</p>
        </div>

        <form
          className="mt-8 space-y-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#181915] p-7 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all"
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Recuperar senha</h2>
            <p className="text-sm text-slate-600 dark:text-zinc-400">
              Digite seu email para receber um código de recuperação.
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-zinc-300">E-mail</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              className={inputClass}
              {...register('email')}
            />
            {errors.email?.message && (
              <p className="mt-2 text-xs font-medium text-red-500">{errors.email.message}</p>
            )}
          </label>

          <button
            type="submit"
            disabled={forgotPasswordMutation.isPending || !isValid}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E88A8] py-3 text-sm font-semibold text-white shadow-md shadow-[#1E88A8]/20 transition-all duration-200 [&:hover:not(:disabled)]:!bg-[#17708A] [&:hover:not(:disabled)]:shadow-lg [&:hover:not(:disabled)]:-translate-y-0.5 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
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

          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <p className="text-center text-sm text-slate-600 dark:text-zinc-400">
            Lembrou a senha?{' '}
            <Link to="/" className="font-semibold text-[#1E88A8] hover:underline transition-colors">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}