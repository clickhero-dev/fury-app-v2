import { useMutation } from '@tanstack/react-query';
import { mockResendOtp } from '../lib/api/auth.mock';

/**
 * Hook para reenviar o código OTP para o email do usuário.
 *
 * Dispara uma nova tentativa de envio do código de verificação
 * sem fazer verificação imediata.
 *
 * @param identifier - userId (registro) ou email (recuperação de senha)
 *   Reutilizado em ambos os fluxos; na prática, qualquer string que identifique
 *   o usuário é compatível.
 *
 * @returns Mutation do React Query para disparo do reenvio
 *
 * @example
 * // Em RegisterPage (com userId)
 * const { mutate: resend, isPending } = useResendOtp();
 * resend(userId);
 *
 * // Em ResetPasswordPage (com email como identificador)
 * const { mutate: resend, isPending } = useResendOtp();
 * resend(email);
 */
export function useResendOtp() {
  return useMutation({
    mutationFn: async (identifier: string): Promise<{ success: boolean }> => {
      // TODO: Substituir por api.post('/auth/resend-otp', { userId: identifier }) quando backend estiver pronto
      return mockResendOtp(identifier);
    },
  });
}
