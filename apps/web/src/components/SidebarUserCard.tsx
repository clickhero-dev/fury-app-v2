import { useAuth } from '@/hooks/useAuth';

interface SidebarUserCardProps {
  collapsed?: boolean;
}

function getInitial(name?: string | null, email?: string | null): string {
  if (name) return name[0].toUpperCase();
  if (email) return email[0].toUpperCase();
  return 'M';
}

export function SidebarUserCard({ collapsed = false }: SidebarUserCardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  const initial = getInitial(user?.name, user?.email);
  const displayName = user?.name || 'Mallyssa Holanda';

  return (
    <div
      className={`flex items-center gap-3 px-2 py-1.5 w-full min-w-0 ${
        collapsed ? 'justify-center' : ''
      }`}
    >
      {/* Avatar redondo em tom ciano escuro */}
      <div className="w-9 h-9 rounded-full bg-[#122b2e] text-[#22d3ee] flex items-center justify-center text-sm font-semibold shrink-0">
        {initial}
      </div>

      {/* Dados do usuário */}
      {!collapsed && (
        <div className="flex-1 min-w-0 text-left">
          <span className="block text-sm font-medium truncate text-foreground leading-tight">
            {displayName}
          </span>
          <span className="block text-xs truncate text-muted-foreground mt-0.5">
            Plano Pro
          </span>
        </div>
      )}
    </div>
  );
}