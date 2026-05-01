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
            error={errors.company?.message}
            {...register('company')}
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
