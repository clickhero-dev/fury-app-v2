import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

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
 * Menu dropdown do usuário autenticado exibido no header da aplicação.
 *
 * Mostra um avatar com as iniciais do usuário. Ao clicar, abre um dropdown com:
 * - Nome e email do usuário autenticado
 * - Botão de logout
 *
 * Não renderiza nada enquanto os dados do usuário estão carregando
 * ou se o usuário não estiver autenticado.
 *
 * @example
 * // Usado no header do AuthenticatedShell
 * <UserMenu />
 */
export function UserMenu() {
  const { user, isLoading } = useAuth();
  const logout = useLogout();

  // Não renderiza durante carregamento ou sem usuário autenticado
  if (isLoading || !user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
          aria-label="Menu do usuário"
        >
          <Avatar>
            <AvatarFallback className="bg-orange-600 text-white">
              {getInitials(user?.name, user?.email)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-semibold text-gray-900">{user?.name ?? '—'}</span>
          <span className="text-xs font-normal text-gray-500">{user?.email ?? '—'}</span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={logout}
          className="text-red-600 hover:!bg-red-50 focus:!bg-red-50 focus:!text-red-600"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}