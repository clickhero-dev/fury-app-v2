import { useMutation } from '@tanstack/react-query';
import type { VerifyEmailRequest, VerifyEmailResponse } from '../types/auth';
import { mockVerifyEmail } from '../lib/api/auth.mock';

/**
 * Hook para verificar o email do usuário via código OTP.
 *
 * Retorna tokens de autenticação após verificação bem-sucedida,
 * permitindo o salvamento da sessão no localStorage.
 *
 * @returns Mutation do React Query para disparo da verificação
 *
 * @example
 * const { mutate: verify, isPending } = useVerifyEmail();
 *
 * verify(
 *   { userId: '123', code: '123456' },
 *   {
 *     onSuccess: (data) => {
 *       localStorage.setItem('token', data.token);
 *       localStorage.setItem('refreshToken', data.refreshToken);
 *       localStorage.setItem('user', JSON.stringify(data.user));
 *       navigate('/onboarding/conectar-meta');
 *     }
 *   }
 * );
 */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (data: VerifyEmailRequest): Promise<VerifyEmailResponse> => {
      // TODO: Substituir por api.post('/auth/verify-email', data) quando backend estiver pronto
      return mockVerifyEmail(data);
    },
  });
}
