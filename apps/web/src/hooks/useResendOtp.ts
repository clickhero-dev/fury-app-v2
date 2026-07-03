import { useMutation } from '@tanstack/react-query';
import { mockResendOtp } from '../lib/api/auth.mock';

/**
 * Hook para reenviar o código OTP para o email do usuário.
 *
 * Dispara uma nova tentativa de envio do código de verificação
 * sem fazer verificação imediata.
 *
 * @returns Mutation do React Query para disparo do reenvio
 *
 * @example
 * const { mutate: resend, isPending } = useResendOtp();
 *
 * resend(
 *   userId,
 *   {
 *     onSuccess: () => {
 *       setResendCountdown(30);
 *     }
 *   }
 * );
 */
export function useResendOtp() {
  return useMutation({
    mutationFn: async (userId: string): Promise<{ success: boolean }> => {
      // TODO: Substituir por api.post('/auth/resend-otp', { userId }) quando backend estiver pronto
      return mockResendOtp(userId);
    },
  });
}
