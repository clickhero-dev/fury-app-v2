import { Link, useLocation } from 'react-router-dom';
import {
  BrainCircuit,
  CalendarDays,
  CreditCard,
  LayoutGrid,
  LogOut,
  Megaphone,
  Palette,
  Plug,
  Settings,
  ChevronLeft,
} from 'lucide-react';
import { useState } from 'react';
import { useLogout } from '@/hooks/useLogout';
import { AdySymbol } from '@/components/AdySymbol';
import { SidebarUserCard } from './SidebarUserCard';
import { captureEvent } from '@/lib/posthog';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const nav = [
  { to: '/dashboard', label: 'Painel', icon: LayoutGrid },
  { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
  { to: '/planejador', label: 'Planejador IA', icon: BrainCircuit },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays },
  { to: '/estudio', label: 'Estúdio', icon: Palette },
  { to: '/configuracoes/integracoes', label: 'Integrações', icon: Plug },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
  { to: '/assinatura', label: 'Assinatura', icon: CreditCard },
];

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const logout = useLogout();

  return (
    <aside
      className={`
        sticky top-0 h-screen shrink-0 flex-col border-r border-border bg-sidebar-bg px-4 py-6
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-20' : 'w-[264px]'}
        ${mobileOpen ? 'flex fixed inset-y-0 left-0 z-50' : 'hidden md:flex'}
      `}
    >
      {/* Header com Ady centralizado na sidebar */}
      <div className="flex items-center justify-center h-12 w-full">
        <Link to="/dashboard" className="flex items-center justify-center gap-2.5">
          <div className="w-6 h-8 text-brand shrink-0 flex items-center justify-center">
            <AdySymbol />
          </div>
          {!collapsed && (
            <span className="text-3xl font-bold tracking-tight text-text-primary lowercase leading-none">
              ady
            </span>
          )}
        </Link>
      </div>

      {/* Navegação */}
      <nav className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto">
        {nav.map(({ to, label, icon: Icon }) => {
          const isActive =
            location.pathname === to ||
            (to !== '/configuracoes' &&
              to !== '/configuracoes/integracoes' &&
              location.pathname.startsWith(to + '/'));

          return (
            <Link
              key={to}
              to={to}
              onClick={() => {
                onMobileClose?.();
                captureEvent('nav_click', { to, label });
              }}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm transition-all ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-sidebar-active text-[#17708A] dark:text-[#2A9BC0] font-semibold shadow-xs'
                  : 'text-text-secondary hover:bg-sidebar-hover hover:text-text-primary font-medium'
              }`}
            >
              <Icon
                className={`size-[18px] shrink-0 ${
                  isActive ? 'text-[#17708A] dark:text-[#2A9BC0]' : 'text-text-tertiary'
                }`}
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Rodapé com Sair e botão de recuar centralizados */}
      <div className="mt-auto space-y-3 pt-4 border-t border-border">
        <SidebarUserCard collapsed={collapsed} />

        {/* Botão Sair */}
        <button
          onClick={() => {
            onMobileClose?.();
            captureEvent('logout');
            logout();
          }}
          title={collapsed ? 'Sair' : undefined}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-text-secondary hover:bg-sidebar-hover hover:text-text-primary transition-colors"
        >
          <LogOut className="size-[18px] shrink-0 text-text-tertiary" />
          {!collapsed && <span>Sair</span>}
        </button>

        {/* Botão Recolher Barra */}
        <div className="hidden md:flex justify-center pt-1">
          <button
            onClick={() => {
              setCollapsed(!collapsed);
              captureEvent('sidebar_toggle_collapse', { collapsed: !collapsed });
            }}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            className="p-1 rounded-md text-text-tertiary hover:bg-sidebar-hover hover:text-text-primary transition-colors"
          >
            <ChevronLeft
              className={`size-4 transition-transform duration-200 ${
                collapsed ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}