import { useMutation } from '@tanstack/react-query';
import type { ForgotPasswordRequest, ForgotPasswordResponse } from '../types/auth';
import api from '../lib/api';

/**
 * Hook para solicitar recuperação de senha via email.
 *
 * Inicia o fluxo de recuperação enviando um código OTP para o email cadastrado.
 * A resposta não inclui o código (será enviado por email).
 *
 * @returns Mutation do React Query para disparo da solicitação
 *
 * @example
 * const { mutate: forgotPassword, isPending } = useForgotPassword();
 *
 * forgotPassword(
 *   { email: 'user@example.com' },
 *   {
 *     onSuccess: () => {
 *       navigate('/reset-password', { state: { email: 'user@example.com' } });
 *     }
 *   }
 * );
 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (data: ForgotPasswordRequest): Promise<ForgotPasswordResponse> => {
      const response = await api.post<{ success: boolean; data: ForgotPasswordResponse; timestamp: string }>(
        '/auth/forgot-password',
        data,
      );
      return response.data.data;
    },
  });
}