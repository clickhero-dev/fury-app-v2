import { useMutation } from '@tanstack/react-query';
import type { RegisterRequest, RegisterResponse } from '../types/auth';
import api from '../lib/api';
import { captureEvent } from '../lib/posthog';

/**
 * Hook para cadastrar um novo usuário na plataforma.
 *
 * Após o cadastro, o usuário ainda precisa fazer login separadamente —
 * este hook não persiste tokens nem redireciona automaticamente.
 *
 * @returns Mutation do React Query para disparo do cadastro
 *
 * @example
 * const { mutate: register, isPending } = useRegister();
 *
 * register(
 *   { name: 'João', email: 'joao@fury.com', password: '123456', companyName: 'Loja XYZ' },
 *   { onSuccess: () => navigate('/login') }
 * );
 */
export function useRegister() {
  return useMutation({
    mutationFn: async (data: RegisterRequest): Promise<RegisterResponse> => {
      captureEvent('signup_iniciado');
      const response = await api.post<{ success: boolean; data: RegisterResponse; timestamp: string }>(
        '/auth/register',
        data
      );
      captureEvent('signup_sucesso');
      return response.data.data as RegisterResponse;
    },
    onError: (error) => {
      captureEvent('signup_falha', { message: error instanceof Error ? error.message : undefined });
    },
  });
}