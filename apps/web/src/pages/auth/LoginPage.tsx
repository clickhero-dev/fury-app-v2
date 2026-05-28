import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
import { AuthLayout } from '@/components/AuthLayout';
import { useLogin } from '@/hooks/useLogin';
import { FURY_COLORS, DEMO_CREDENTIALS } from '@/lib/constants';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const [error, setError] = useState<string>('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      setError('');
      await loginMutation.mutateAsync({
        email: data.email,
        password: data.password,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-4xl font-black text-white">Bem-vindo de volta</h2>
          <p className="text-zinc-300 font-medium">Acesse sua conta FURY agora</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            label="Email"
            placeholder="seu@email.com"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <FormField
            label="Senha"
            placeholder="••••••••"
            type="password"
            error={errors.password?.message}
            {...register('password')}
          />

          {error && (
            <div className="bg-red-950/40 border border-red-900/50 rounded-xl p-4 flex gap-3 items-start">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-semibold text-red-200">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            className="w-full mt-6 group relative overflow-hidden"
            disabled={loginMutation.isPending}
            aria-busy={loginMutation.isPending}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
            <span className="relative flex items-center justify-center">
              {loginMutation.isPending ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Entrando...
                </>
              ) : (
                'Entrar na conta'
              )}
            </span>
          </Button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#27272A]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-3 bg-[#18181B] text-zinc-300">ou</span>
          </div>
        </div>

        {/* Sign Up Link */}
        <div className="space-y-4">
          <p className="text-center text-zinc-300 text-sm">
            Não tem conta?{' '}
            <Link
              to="/cadastro"
              className="font-bold text-[#FF9244] hover:text-[#FFAA55] transition-colors"
            >
              Criar conta gratuita
            </Link>
          </p>

          {/* Demo Credentials */}
          <div className="relative bg-gradient-to-br from-[#EA580C]/15 to-[#EA580C]/5 border border-[#EA580C]/40 rounded-xl p-4 space-y-3 group hover:border-[#EA580C]/60 transition-all duration-300">
            <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 bg-[#EA580C]/30 border border-[#EA580C]/60 rounded-lg">
              <span className="w-2 h-2 bg-[#FF9244] rounded-full animate-pulse" />
              <span className="text-xs font-bold text-[#FF9244] uppercase tracking-widest">Demo</span>
            </div>

            <p className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Credenciais Demo</p>
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">Email:</span>
                <code className="text-sm font-bold text-[#FF9244] font-mono bg-[#27272A]/60 px-2 py-1 rounded group-hover:bg-[#EA580C]/25 transition-colors">{DEMO_CREDENTIALS.email}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">Senha:</span>
                <code className="text-sm font-bold text-[#FF9244] font-mono bg-[#27272A]/60 px-2 py-1 rounded group-hover:bg-[#EA580C]/25 transition-colors">{DEMO_CREDENTIALS.password}</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
