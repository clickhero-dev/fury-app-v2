import { LayoutDashboard, Megaphone, Palette, Settings, ChevronLeft, CreditCard, X, LogOut } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';

interface SidebarProps {
  /** Controla se a sidebar está aberta no mobile (overlay lateral). */
  mobileOpen?: boolean;
  /** Callback chamado ao fechar a sidebar no mobile. */
  onMobileClose?: () => void;
}

/**
 * Itens de navegação principal da sidebar.
 * Cada item define o ícone, label e rota de destino.
 */
const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Megaphone, label: 'Campanhas', path: '/campanhas' },
  // ponytail: automação movida para Configurações > tab Automação
  // { icon: Zap, label: 'Automação', path: '/automacao/minhas-regras' },
  // ponytail: oculto até feature de orçamento smart estar pronta
  // { icon: Wallet, label: 'Orçamento Smart', path: '/orcamento-smart' },
  { icon: Palette, label: 'Estúdio', path: '/estudio' },
  { icon: Settings, label: 'Configurações', path: '/configuracoes' },
  { icon: CreditCard, label: 'Assinatura', path: '/assinatura' },
];

/**
 * Sidebar de navegação principal da aplicação.
 *
 * Funcionalidades:
 * - **Desktop:** Fixada à esquerda, pode ser colapsada para modo ícones (largura reduzida).
 * - **Mobile:** Abre como overlay lateral controlado por `mobileOpen`.
 *   Um overlay escuro é renderizado pelo `AuthenticatedShell` ao abrir.
 * - **Item ativo:** Destaca o item correspondente à rota atual via `useLocation`.
 *   Suporta correspondência exata e por prefixo de rota (exceto `/configuracoes`).
 * - **Logout:** Exibe o primeiro nome do usuário autenticado e executa logout ao clicar.
 * - **Colapso:** Botão visível apenas no desktop para alternar entre modo expandido e colapsado.
 *   No modo colapsado, os labels são ocultados e os ícones ficam centralizados.
 *
 * @param mobileOpen - Se `true`, exibe a sidebar no mobile via translateX
 * @param onMobileClose - Callback para fechar a sidebar no mobile
 *
 * @example
 * // Usado no AuthenticatedShell
 * <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
 */
export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const logout = useLogout();

  return (
    <aside
      className={`
        bg-sidebar-bg text-sidebar-text flex flex-col border-r border-sidebar-hover
        fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-out
        md:static md:z-auto md:translate-x-0 md:transition-all md:duration-300
        w-64 ${collapsed ? 'md:w-20' : 'md:w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      {/* Cabeçalho com logo e botão de fechar (mobile) */}
      <div className="p-6 flex items-center justify-between flex-shrink-0">
        {!collapsed && (
          <h1 className="text-xl font-bold tracking-wider !text-white">FURY</h1>
        )}
        <button
          onClick={onMobileClose}
          className="md:hidden ml-auto p-1 rounded text-sidebar-icon/70 hover:text-sidebar-text transition-colors"
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navegação principal */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            // Item ativo por correspondência exata ou prefixo de rota
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/configuracoes' && location.pathname.startsWith(item.path + '/'));
            const Icon = item.icon;

            return (
              <li key={item.label}>
                <Link
                  to={item.path}
                  onClick={onMobileClose}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-sidebar-active text-sidebar-text'
                      : 'text-sidebar-icon/85 hover:bg-sidebar-hover hover:text-sidebar-text'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Rodapé: logout e botão de colapso */}
      <div className="pb-3 space-y-2 flex-shrink-0">
        <div className="px-3 border-t border-sidebar-hover pt-3">
          <button
            onClick={() => { onMobileClose?.(); logout(); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-icon/70 hover:bg-sidebar-hover hover:text-sidebar-text transition-colors${
              collapsed ? 'justify-center' : ''
            }`}
            title={collapsed ? 'Sair' : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && (
              <span className="flex-1 text-left truncate">
                {/* Exibe apenas o primeiro nome do usuário autenticado */}
                {user?.name ? `Sair (${user.name.split(' ')[0]})` : 'Sair'}
              </span>
            )}
          </button>
        </div>

        {/* Botão de colapso — visível apenas no desktop */}
        <div className="px-3 border-t border-sidebar-hover pt-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex w-full items-center justify-center px-3 py-2.5rounded-lg text-sidebar-icon/85 hover:bg-sidebar-hover hover:text-sidebar-text transition-colors"
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            <ChevronLeft
              className={`w-5 h-5 transition-transform duration-300 ${
                collapsed ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}