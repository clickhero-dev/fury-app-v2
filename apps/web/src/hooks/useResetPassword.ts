import { useMutation } from '@tanstack/react-query';
import type { ResetPasswordRequest, ResetPasswordResponse } from '../types/auth';
import { mockResetPassword } from '../lib/api/auth.mock';

/**
 * Hook para redefinir a senha via código OTP.
 *
 * Valida o código OTP e define a nova senha. O email é necessário para
 * identificar a sessão de recuperação (na prática, seria um token gerado
 * no backend durante o forgot-password).
 *
 * @returns Mutation do React Query para disparo da redefinição
 *
 * @example
 * const { mutate: resetPassword, isPending } = useResetPassword();
 *
 * resetPassword(
 *   { email: 'user@example.com', code: '123456', newPassword: 'newpass123' },
 *   {
 *     onSuccess: () => {
 *       navigate('/reset-password/success');
 *     }
 *   }
 * );
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (data: ResetPasswordRequest): Promise<ResetPasswordResponse> => {
      // TODO: Substituir por api.post('/auth/reset-password', data) quando backend estiver pronto
      return mockResetPassword(data);
    },
  });
}
