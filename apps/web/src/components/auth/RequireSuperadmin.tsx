import { Navigate } from 'react-router-dom';
import type { User } from '@/types/auth';

interface RequireSuperadminProps {
  children: React.ReactNode;
}

/**
 * Componente de rota protegida por role de superadmin.
 *
 * Verifica se há um token JWT e se o usuário tem role === 'superadmin'
 * no localStorage antes de renderizar o conteúdo filho.
 * Se não houver token OU role !== 'superadmin', redireciona para `/admin/login`.
 *
 * @param children - Conteúdo a ser renderizado se autenticado como superadmin
 *
 * @example
 * <RequireSuperadmin>
 *   <AdminShell />
 * </RequireSuperadmin>
 */
export function RequireSuperadmin({ children }: RequireSuperadminProps) {
  const token = localStorage.getItem('token');

  let isSuperadmin = false;
  if (token) {
    try {
      const user: User = JSON.parse(localStorage.getItem('user') || '{}');
      isSuperadmin = user.role === 'superadmin';
    } catch {
      isSuperadmin = false;
    }
  }

  if (!token || !isSuperadmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}