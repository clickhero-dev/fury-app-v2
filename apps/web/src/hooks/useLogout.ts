import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook que retorna a função de logout do usuário.
 *
 * Ao ser chamada, a função:
 * 1. Remove token JWT, refresh token e dados do usuário do localStorage
 * 2. Limpa todo o cache do React Query (evita dados de outro usuário em cache)
 * 3. Redireciona para `/login` substituindo o histórico de navegação
 *
 * @returns Função de logout sem parâmetros
 *
 * @example
 * const logout = useLogout();
 *
 * <button onClick={logout}>Sair</button>
 */
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');

    // Limpa cache para evitar que dados do usuário anterior sejam exibidos
    queryClient.clear();

    navigate('/login', { replace: true });
  };
}