import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useLogin } from '@/hooks/useLogin';
import { DEMO_CREDENTIALS } from '@/lib/constants';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Converte erros de login em mensagens amigáveis para o usuário.
 *
 * @param err - Erro capturado no bloco catch do submit
 * @returns Mensagem de erro legível para exibição na UI
 */
function getFriendlyError(err: unknown): string {
  if (isAxiosError(err)) {
    if (err.response?.status === 401) {
      return 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.';
    }
    if (!err.response || err.code === 'ERR_NETWORK') {
      return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.';
    }
  }
  return 'Ocorreu um erro inesperado. Tente novamente em alguns instantes.';
}

/**
 * Página de login da aplicação FURY.
 *
 * Exibe um formulário de autenticação com validação via Zod + React Hook Form.
 * Em caso de sucesso, redireciona o usuário para `/dashboard`.
 * Também expõe um bloco de credenciais demo com preenchimento automático.
 *
 * @remarks
 * - Utiliza `useLogin` para executar a mutation de autenticação
 * - Erros de rede e credenciais inválidas são tratados por `getFriendlyError`
 * - O campo de senha possui toggle de visibilidade
 *
 * @example
 * // Registrada na rota pública `/login`
 * <Route path="/login" element={<LoginPage />} />
 */
export function LoginPage() {
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const [error, setError] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  /**
   * Submete as credenciais do formulário.
   * Em caso de sucesso, navega para `/dashboard`.
   * Em caso de erro, exibe mensagem amigável via `getFriendlyError`.
   */
  const onSubmit = async (data: LoginFormValues) => {
    try {
      setError('');
      await loginMutation.mutateAsync({ email: data.email, password: data.password });
      navigate('/dashboard');
    } catch (err) {
      setError(getFriendlyError(err));
    }
  };

  /**
   * Preenche automaticamente os campos com as credenciais de demonstração
   * definidas em `DEMO_CREDENTIALS`, sem disparar validação.
   */
  const fillDemo = () => {
    setValue('email', DEMO_CREDENTIALS.email, { shouldValidate: false });
    setValue('password', DEMO_CREDENTIALS.password, { shouldValidate: false });
    setError('');
  };

  return (
    // ... JSX inalterado
  );
}