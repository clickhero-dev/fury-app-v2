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
      await loginMutation.mutateAsync(data);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-gray-900">Entrar</h2>
          <p className="text-gray-500">Acesse sua conta FURY</p>
        </div>

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
            placeholder="••••••"
            type="password"
            error={errors.password?.message}
            {...register('password')}
          />

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm font-medium">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full text-white font-semibold"
            size="md"
            disabled={loginMutation.isPending}
            aria-busy={loginMutation.isPending}
          >
            {loginMutation.isPending ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <div className="border-t border-gray-100 pt-6 text-center">
          <p className="text-gray-600 text-sm">
            Não tem conta?{' '}
            <Link
              to="/cadastro"
              className="font-semibold hover:opacity-80 transition-opacity"
              style={{ color: FURY_COLORS.primary }}
            >
              Criar conta
            </Link>
          </p>
        </div>

        <div className="p-4 bg-gray-50 border border-gray-100 rounded-lg space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Demo</p>
          <div className="text-sm text-gray-700 space-y-1">
            <p>Email: <code className="font-mono bg-white px-2 py-1 rounded border border-gray-200">{DEMO_CREDENTIALS.email}</code></p>
            <p>Senha: <code className="font-mono bg-white px-2 py-1 rounded border border-gray-200">{DEMO_CREDENTIALS.password}</code></p>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
