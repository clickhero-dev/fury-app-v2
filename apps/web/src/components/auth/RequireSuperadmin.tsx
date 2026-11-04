import { Navigate } from 'react-router-dom';
import { canAccessAdmin, getStoredPlatformRole } from '@/lib/platform-role';

interface RequireSuperadminProps {
  children: React.ReactNode;
}

/**
 * Componente de rota protegida do admin.
 *
 * Verifica se há um token JWT e se o platformRole salvo é super_admin ou
 * admin_partner antes de renderizar o conteúdo filho. O servidor confere de novo.
 * Caso contrário, redireciona para `/admin/login`.
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

  if (!token || !canAccessAdmin(getStoredPlatformRole())) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}