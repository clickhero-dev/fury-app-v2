import { LayoutDashboard, Megaphone, Palette, Settings, ChevronLeft, CreditCard, X, LogOut, Plug } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { SidebarUserCard } from '@/components/SidebarUserCard';

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
  // ponytail: oculto — lançamento adiado (Planejador IA + Calendário)
  // { icon: BrainCircuit, label: 'Planejador IA', path: '/planejador' },
  // { icon: CalendarDays, label: 'Calendário', path: '/calendario' },
  { icon: Palette, label: 'Estúdio', path: '/estudio' },
  { icon: Plug, label: 'Integrações', path: '/configuracoes/integracoes' },
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
 * - **Perfil:** Exibe o `SidebarUserCard` com avatar, nome e plano do usuário (oculto quando colapsada).
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
        md:sticky md:top-0 md:h-screen md:z-auto md:translate-x-0 md:transition-all md:duration-300
        w-64 ${collapsed ? 'md:w-20' : 'md:w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      {/* Cabeçalho com logo e botão de fechar (mobile) */}
      <div
        className={`h-[72px] flex items-center flex-shrink-0 overflow-hidden whitespace-nowrap ${
          collapsed ? 'justify-center px-0' : 'justify-between px-6'
        }`}
      >
        <h1
          className="text-xl font-black tracking-[-0.03em] !text-sidebar-text leading-none"
          style={{ letterSpacing: '-0.03em' }}
        >
          {collapsed ? 'F' : 'FURY'}
        </h1>
        {!collapsed && (
          <button
            onClick={onMobileClose}
            className="md:hidden ml-auto p-1 rounded text-sidebar-icon/70 hover:text-sidebar-text transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navegação principal */}
      <nav className="flex-1 px-3 flex flex-col gap-0.5 overflow-y-auto">
        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            // Item ativo por correspondência exata ou prefixo de rota
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/configuracoes' && item.path !== '/configuracoes/integracoes' && location.pathname.startsWith(item.path + '/'));
            const Icon = item.icon;

            return (
              <li key={item.label}>
                <Link
                  to={item.path}
                  onClick={onMobileClose}
                  title={collapsed ? item.label : undefined}
                  className={`relative w-full flex items-center gap-3 h-10 px-3 rounded-full text-sm font-medium overflow-hidden transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-white/15 text-sidebar-text'
                      : 'text-sidebar-icon/85 hover:bg-white/10 hover:text-sidebar-text'
                  }`}
                >
                  {/* Indicador de item ativo */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-text" />
                  )}
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.5} className="flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
{/* Rodapé: card de perfil, logout e botão de colapso */}
<div className="px-3 pb-5">
        {!collapsed && (
          <div className="mb-2">
            <SidebarUserCard />
          </div>
        )}

        <div className="border-t border-sidebar-hover pt-3 flex justify-center">
          <button
            onClick={() => { onMobileClose?.(); logout(); }}
            title={collapsed ? 'Sair' : undefined}
            className={`group inline-flex items-center justify-center gap-2 rounded-full text-[13px] font-medium transition-colors ${
              collapsed ? 'w-10 h-10 mx-auto px-0' : 'px-3 h-9'
            }`}
          >
            <LogOut size={16} strokeWidth={2} className="flex-shrink-0 text-sidebar-text/70 group-hover:text-sidebar-text transition-colors" />
            {!collapsed && (
              <span className="flex-shrink-0 truncate text-sidebar-text/70 group-hover:text-sidebar-text transition-colors">
                {user?.name ? `Sair (${user.name.split(' ')[0]})` : 'Sair'}
              </span>
            )}
          </button>
        </div>

        {/* Botão de colapso — visível apenas no desktop */}
        <div className="mt-3 pt-3 border-t border-sidebar-hover hidden md:flex justify-center">
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer"
          >
            <ChevronLeft
              size={16}
              strokeWidth={2}
              className={`text-sidebar-icon/70 hover:text-sidebar-text transition-all duration-300 ${collapsed ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}