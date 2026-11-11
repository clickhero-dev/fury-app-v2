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

// membro usa a integração do titular, sem mexer nela (só tela; a API confere)
export function isMemberAccount(): boolean {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')?.role === 'member';
  } catch {
    return false;
  }
}

export function isIntegrationsPath(pathname: string): boolean {
  return pathname === '/configuracoes/integracoes' || pathname.startsWith('/configuracoes/integracoes/');
}

type RoleHolder = { role: string; platformRole?: string | null };

const ROLE_LABELS: Record<string, string> = { owner: 'Usuário Titular', member: 'Usuário', admin: 'Administrador', superadmin: 'Super Administrador' };

export function roleLabel(user: RoleHolder): string {
  if (user.platformRole === 'super_admin') return 'Super Administrador';
  if (user.platformRole === 'admin_partner') return 'Parceiro';
  return ROLE_LABELS[user.role] ?? user.role;
}

// laranja: vinculado a parceiro; azul: vinculado à ady
export function roleBadgeClass(user: RoleHolder): string {
  return user.platformRole === 'admin_partner' || user.platformRole === 'user_partner'
    ? 'bg-spark/15 text-[#B55F02] dark:text-spark'
    : 'bg-brand/15 text-[#17708A] dark:text-[#1E88A8]';
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
