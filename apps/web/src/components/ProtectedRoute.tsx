import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Componente de rota protegida por autenticação.
 *
 * Verifica se há um token JWT no localStorage antes de renderizar
 * o conteúdo filho. Se não houver token, redireciona para `/login`.
 *
 * Usado para proteger rotas individuais fora do `AuthenticatedShell`,
 * como `/onboarding/selecionar-conta`.
 *
 * @param children - Conteúdo a ser renderizado se autenticado
 *
 * @example
 * <ProtectedRoute>
 *   <SelecionarAtivosPage />
 * </ProtectedRoute>
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const token = localStorage.getItem('token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}