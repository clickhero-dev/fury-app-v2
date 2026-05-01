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
      <div className="space-y-10">
        {/* Header */}
        <div className="space-y-3">
          <h2 className="text-3xl font-black text-[#1C1C1E]">Bem-vindo</h2>
          <p className="text-lg text-[#6E7681] font-medium">Acesse sua conta FURY</p>
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
            disabled={loginMutation.isPending}
            aria-busy={loginMutation.isPending}
          >
            {loginMutation.isPending ? 'Entrando...' : 'Entrar na conta'}
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

        {/* Sign Up Link */}
        <div className="space-y-4">
          <p className="text-center text-[#6E7681] text-sm">
            Não tem conta?{' '}
            <Link
              to="/cadastro"
              className="font-bold hover:underline transition-all"
              style={{ color: FURY_COLORS.primary }}
            >
              Criar conta gratuita
            </Link>
          </p>

          {/* Demo Credentials */}
          <div className="bg-[#F6F8FA] border border-[#E0E0E0] rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-[#6E7681] uppercase tracking-widest">Credenciais Demo</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#6E7681]">Email:</span>
                <code className="text-sm font-bold text-[#1C1C1E] font-mono">{DEMO_CREDENTIALS.email}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#6E7681]">Senha:</span>
                <code className="text-sm font-bold text-[#1C1C1E] font-mono">{DEMO_CREDENTIALS.password}</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
