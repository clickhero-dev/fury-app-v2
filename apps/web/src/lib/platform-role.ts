// Papel na plataforma (users.platform_role). O servidor confere de novo; aqui é só para a tela.
export type PlatformRole = 'super_admin' | 'admin_partner' | 'user_partner' | 'user';

// Sessão anterior ao platformRole: deduz pelo role antigo
export function platformRoleOf(user: { role?: string; platformRole?: string } | null | undefined): PlatformRole {
  if (user?.platformRole) return user.platformRole as PlatformRole;
  return user?.role === 'superadmin' ? 'super_admin' : 'user';
}

export function getStoredPlatformRole(): PlatformRole {
  try {
    return platformRoleOf(JSON.parse(localStorage.getItem('user') || '{}'));
  } catch {
    return 'user';
  }
}

export function canAccessAdmin(role: PlatformRole): boolean {
  return role === 'super_admin' || role === 'admin_partner';
}

// Conta do parceiro é vitalícia: sem planos, assinatura nem faturamento
export function hasLifetimeAccess(role: PlatformRole = getStoredPlatformRole()): boolean {
  return role === 'admin_partner';
}

const BILLING_PATHS = ['/planos', '/assinatura'];

export function isBillingPath(pathname: string): boolean {
  return BILLING_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
