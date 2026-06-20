import { useMutation } from '@tanstack/react-query';
import type { RegisterRequest, RegisterResponse } from '../types/auth';
import api from '../lib/api';

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
      const response = await api.post<{ success: boolean; data: RegisterResponse; timestamp: string }>(
        '/auth/register',
        data
      );
      return response.data.data as RegisterResponse;
    },
  });
}