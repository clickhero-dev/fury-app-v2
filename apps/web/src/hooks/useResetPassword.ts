import { useMutation } from '@tanstack/react-query';
import type { ResetPasswordRequest, ResetPasswordResponse } from '../types/auth';
import api from '../lib/api';

/**
 * Hook para redefinir a senha via código OTP.
 *
 * Valida o código OTP (campo `otp`) e define a nova senha. O email é necessário
 * para identificar a sessão de recuperação.
 *
 * @returns Mutation do React Query para disparo da redefinição
 *
 * @example
 * const { mutate: resetPassword, isPending } = useResetPassword();
 *
 * resetPassword(
 *   { email: 'user@example.com', otp: '123456', newPassword: 'NovaSenha1!' },
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
      const response = await api.post<{ success: boolean; data: ResetPasswordResponse; timestamp: string }>(
        '/auth/reset-password',
        data,
      );
      return response.data.data;
    },
  });
}