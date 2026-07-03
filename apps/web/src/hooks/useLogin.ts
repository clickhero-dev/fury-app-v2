import { useMutation } from '@tanstack/react-query';
import type { LoginRequest, LoginResponse } from '../types/auth';
import api from '../lib/api';

/**
 * Hook para autenticar o usuário com e-mail e senha.
 *
 * Após o login bem-sucedido, salva automaticamente no localStorage:
 * - `token` — JWT de acesso
 * - `refreshToken` — token para renovação de sessão
 * - `user` — dados do usuário autenticado (JSON)
 *
 * @returns Mutation do React Query para disparo do login
 *
 * @example
 * const { mutate: login, isPending } = useLogin();
 *
 * login(
 *   { email: 'joao@fury.com', password: '123456' },
 *   { onSuccess: () => navigate('/dashboard') }
 * );
 */
export function useLogin() {
  return useMutation({
    mutationFn: async (data: LoginRequest): Promise<LoginResponse> => {
      const response = await api.post<{ success: boolean; data: LoginResponse; timestamp: string }>(
        '/auth/login',
        data
      );
      const result = response.data.data;

      // Persiste sessão no localStorage para uso pelo cliente HTTP e useAuth
      localStorage.setItem('token', result.token);
      localStorage.setItem('refreshToken', result.refreshToken);
      localStorage.setItem('user', JSON.stringify(result.user));

      return result;
    },
  });
}