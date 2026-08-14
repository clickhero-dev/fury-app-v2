import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useBilling';

interface SidebarUserCardProps {
  collapsed?: boolean;
}

/**
 * Pega apenas a primeira letra do nome do usuário (ou do e-mail como fallback).
 */
function getInitial(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    return name.trim()[0].toUpperCase();
  }

  if (email && email.trim()) {
    return email.trim()[0].toUpperCase();
  }

  return '?';
}

export function SidebarUserCard({ collapsed = false }: SidebarUserCardProps) {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { data: subscription, isLoading: isLoadingSub } = useSubscription();

  if (isLoadingAuth || !user) return null;

  // Nome do usuário: se null, assume "Meu Perfil"
  const displayName = user.name && user.name.trim() !== '' ? user.name : 'Meu Perfil';

  // Apenas a PRIMEIRA letra para o avatar
  const initial = getInitial(user.name, user.email);

  // Nome do plano retornado pela API
  const userPlan = isLoadingSub
    ? 'Carregando...'
    : subscription?.plan?.name ?? 'Sem plano ativo';

  return (
    <div
      className={`flex items-center gap-3 px-2 py-1.5 w-full min-w-0 ${
        collapsed ? 'justify-center' : ''
      }`}
    >
      {/* Avatar com apenas 1 letra */}
      <div className="w-10 h-10 rounded-full bg-[#122b2e] text-[#22d3ee] flex items-center justify-center text-sm font-semibold shrink-0">
        {initial}
      </div>

      {/* Nome e Plano do Usuário */}
      {!collapsed && (
        <div className="flex-1 min-w-0 text-left">
          <span className="block text-sm font-medium truncate text-foreground leading-tight">
            {displayName}
          </span>
          <span className="block text-xs truncate text-muted-foreground mt-0.5">
            {userPlan}
          </span>
        </div>
      )}
    </div>
  );
}