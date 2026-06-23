import { LayoutDashboard, Megaphone, Palette, Settings, ChevronLeft, Zap, CreditCard, X, LogOut, Target, Wallet } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Target, label: 'Metas', path: '/onboarding/metas' },
  { icon: Megaphone, label: 'Campanhas', path: '/campanhas' },
  { icon: Zap, label: 'Automação', path: '/automacao/minhas-regras' },
  { icon: Wallet, label: 'Orçamento Smart', path: '/orcamento-smart' },
  { icon: Palette, label: 'Estúdio', path: '/estudio' },
  { icon: Settings, label: 'Configurações', path: '/configuracoes' },
  { icon: CreditCard, label: 'Assinatura', path: '/assinatura' },
];

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const logout = useLogout();

  return (
    <aside
      className={`
        bg-sidebar text-white flex flex-col border-r border-sidebar-hover
        fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-out
        md:static md:z-auto md:translate-x-0 md:transition-all md:duration-300
        w-64 ${collapsed ? 'md:w-20' : 'md:w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      <div className="p-6 flex items-center justify-between flex-shrink-0">
        {!collapsed && (
          <h1 className="text-xl font-bold tracking-wider !text-white">FURY</h1>
        )}
        <button
          onClick={onMobileClose}
          className="md:hidden ml-auto p-1 rounded text-white/70 hover:text-white transition-colors"
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
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
                      ? 'bg-sidebar-active text-white'
                      : 'text-white/85 hover:bg-sidebar-hover hover:text-white'
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

      <div className="pb-3 space-y-2 flex-shrink-0">
        <div className="px-3 border-t border-sidebar-hover pt-3">
          <button
            onClick={() => { onMobileClose?.(); logout(); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-sidebar-hover hover:text-white transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
            title={collapsed ? 'Sair' : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && (
              <span className="flex-1 text-left truncate">
                {user?.name ? `Sair (${user.name.split(' ')[0]})` : 'Sair'}
              </span>
            )}
          </button>
        </div>

        <div className="px-3 border-t border-sidebar-hover pt-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex w-full items-center justify-center px-3 py-2.5 rounded-lg text-white/85 hover:bg-sidebar-hover hover:text-white transition-colors"
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
