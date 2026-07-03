import { useEffect, useState } from 'react';
import type { User } from '../types/auth';

/**
 * Hook de autenticação da aplicação.
 *
 * Recupera os dados do usuário autenticado salvos no localStorage
 * e expõe a função de logout.
 *
 * @returns `user` - Dados do usuário autenticado ou `null` se não autenticado
 * @returns `isLoading` - `true` enquanto os dados estão sendo carregados do localStorage
 * @returns `logout` - Função que limpa a sessão e desloga o usuário
 *
 * @example
 * const { user, isLoading, logout } = useAuth();
 *
 * if (isLoading) return <Spinner />;
 * if (!user) return <Navigate to="/login" />;
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Ao montar o componente, verifica se há token e dados de usuário
   * salvos no localStorage. Se encontrar, popula o estado `user`.
   */
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setIsLoading(false);
  }, []);

  /**
   * Remove o token JWT e os dados do usuário do localStorage,
   * limpando o estado de autenticação.
   * O redirecionamento para `/login` é responsabilidade do componente chamador.
   */
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return { user, isLoading, logout };
}
