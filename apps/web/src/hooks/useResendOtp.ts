import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Hook para reenviar o código de recuperação de senha para o email.
 *
 * Reusa o endpoint `POST /auth/forgot-password` (idempotente): regenera o código,
 * reenvia o email e respeita o rate-limit. Não é preciso um endpoint `/resend-otp`.
 *
 * @param email - email da conta que está recuperando a senha
 *
 * @returns Mutation do React Query para disparo do reenvio
 *
 * @example
 * const { mutate: resend, isPending } = useResendOtp();
 * resend('user@example.com');
 */
export function useResendOtp() {
  return useMutation({
    mutationFn: async (identifier: string): Promise<{ success: boolean }> => {
      await api.post<{ success: boolean; timestamp: string }>('/auth/forgot-password', {
        email: identifier,
      });
      return { success: true };
    },
  });
}