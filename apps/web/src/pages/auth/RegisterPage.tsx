import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
import { AuthLayout } from '@/components/AuthLayout';
import { useRegister } from '@/hooks/useRegister';
import { FURY_COLORS } from '@/lib/constants';

const registerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  company: z.string().min(2, 'Nome da empresa é obrigatório'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const [error, setError] = useState<string>('');

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
      company: '',
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    try {
      setError('');
      await registerMutation.mutateAsync(data);
      navigate('/onboarding/conectar-meta');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar');
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-gray-900">Criar conta</h2>
          <p className="text-gray-500">Comece sua jornada com FURY</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            label="Nome Completo"
            placeholder="Seu nome"
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
            placeholder="••••••••"
            type="password"
            error={errors.password?.message}
            {...register('password')}
          />

          <FormField
            label="Nome da Empresa"
            placeholder="Sua empresa"
            error={errors.company?.message}
            {...register('company')}
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
            disabled={registerMutation.isPending}
            aria-busy={registerMutation.isPending}
          >
            {registerMutation.isPending ? 'Registrando...' : 'Registrar'}
          </Button>
        </form>

        <div className="border-t border-gray-100 pt-6 text-center">
          <p className="text-gray-600 text-sm">
            Já tem conta?{' '}
            <Link
              to="/login"
              className="font-semibold hover:opacity-80 transition-opacity"
              style={{ color: FURY_COLORS.primary }}
            >
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
