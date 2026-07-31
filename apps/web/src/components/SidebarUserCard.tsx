import { useAuth } from '@/hooks/useAuth';

/**
 * Gera as iniciais do usuário para exibição no avatar.
 * Usa as duas primeiras palavras do nome, ou a primeira letra do email como fallback.
 *
 * @param name - Nome completo do usuário
 * @param email - Email do usuário (fallback se nome não disponível)
 * @returns Iniciais em maiúsculo (ex: "JS" para "João Silva") ou "?" se nenhum dado disponível
 *
 * @example
 * getInitials('João Silva', null)  // → 'JS'
 * getInitials(null, 'joao@fury.com') // → 'J'
 * getInitials(null, null) // → '?'
 */
function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

/**
 * Card de perfil do usuário exibido no rodapé da sidebar.
 *
 * Mostra o avatar (iniciais), nome (ou email como fallback) e o plano atual.
 * É apenas informativo — a ação de logout continua no botão "Sair" da sidebar,
 * evitando duplicar essa função em dois elementos diferentes.
 *
 * Não renderiza nada enquanto os dados do usuário estão carregando
 * ou se o usuário não estiver autenticado.
 *
 * @example
 * // Usado dentro do Sidebar.tsx, entre a nav e o botão "Sair"
 * {!collapsed && <SidebarUserCard />}
 */
export function SidebarUserCard() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) return null;

  return (
  <div className="w-full flex items-center gap-3 px-3 h-12 rounded-full bg-white/12 hover:bg-white/18 transition-colors">
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-accent-light text-white">
          {getInitials(user?.name, user?.email)}
      </div>
    <div className="flex-1 min-w-0 text-left">
    <span className="block text-xs font-semibold truncate text-sidebar-text">
        Meu Perfil
      </span>
      <span className="block text-[11px] truncate text-sidebar-text/60">
          Plano PRO
      </span>
    </div>
  </div>
);
  
}