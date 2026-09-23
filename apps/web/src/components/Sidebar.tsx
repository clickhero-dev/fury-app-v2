import { Link, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  CreditCard,
  LayoutGrid,
  LogOut,
  Megaphone,
  Palette,
  Plug,
  Settings,
  Users,
  ChevronLeft,
} from 'lucide-react';
import { useState } from 'react';
import { useLogout } from '@/hooks/useLogout';
import { AdySymbol } from '@/components/AdySymbol';
import { SidebarUserCard } from './SidebarUserCard';
import { captureEvent } from '@/lib/posthog';
import { isNavItemActive, isNavItemCurrent, type NavItemShape } from './sidebarNav';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem extends NavItemShape {
  label: string;
  icon: typeof LayoutGrid;
  children?: NavItem[];
}

// Navegação agrupada por tarefa do usuário (não por área técnica):
// Gestão (dia a dia) → Criação (conteúdo) → Conta (configuração/assinatura).
// Orçamento Smart fica FORA da sidebar (feature oculta); o Planejador IA
// entra como aba dentro de Planejamento quando for liberado (/planejador
// já conta como ativo para o item).
const sections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Gestão',
    items: [
      { to: '/dashboard', label: 'Painel', icon: LayoutGrid },
      { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
      { to: '/leads', label: 'Leads', icon: Users },
    ],
  },
  {
    label: 'Criação',
    items: [
      { to: '/estudio', label: 'Estúdio', icon: Palette },
      { to: '/calendario', label: 'Planejamento', icon: CalendarDays, alsoActive: ['/planejador'] },
    ],
  },
  {
    label: 'Conta',
    items: [
      {
        to: '/configuracoes',
        label: 'Configurações',
        icon: Settings,
        children: [
          { to: '/configuracoes/integracoes', label: 'Integrações', icon: Plug },
        ],
      },
      { to: '/assinatura', label: 'Assinatura', icon: CreditCard },
    ],
  },
];

function SidebarItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate: (target?: NavItem) => void;
}) {
  const location = useLocation();
  const isActive = isNavItemActive(item, location.pathname);
  const hasChildActive = (item.children ?? []).some((c) => isNavItemActive(c, location.pathname));

  const activeClass =
    isActive || hasChildActive
      ? 'bg-sidebar-active text-[#17708A] dark:text-[#2A9BC0] font-semibold shadow-xs'
      : 'text-text-secondary hover:bg-sidebar-hover hover:text-text-primary font-medium';
  const iconClass =
    isActive || hasChildActive ? 'text-[#17708A] dark:text-[#2A9BC0]' : 'text-text-tertiary';

  return (
    <>
      <Link
        to={item.to}
        onClick={() => onNavigate()}
        title={collapsed ? item.label : undefined}
        aria-current={isNavItemCurrent(item, location.pathname) ? 'page' : undefined}
        className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm transition-all ${
          collapsed ? 'justify-center' : ''
        } ${activeClass}`}
      >
        <item.icon className={`size-[18px] shrink-0 ${iconClass}`} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
      {!collapsed && item.children && (
        <div className="ml-5 flex flex-col gap-1 border-l border-border pl-3">
          {item.children.map((child) => (
            <Link
              key={child.to}
              to={child.to}
              onClick={() => onNavigate(child)}
              aria-current={isNavItemCurrent(child, location.pathname) ? 'page' : undefined}
              className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2 text-sm transition-all ${
                isNavItemActive(child, location.pathname)
                  ? 'bg-sidebar-active text-[#17708A] dark:text-[#2A9BC0] font-semibold shadow-xs'
                  : 'text-text-secondary hover:bg-sidebar-hover hover:text-text-primary font-medium'
              }`}
            >
              <child.icon className={`size-[16px] shrink-0 ${iconClass}`} />
              <span className="truncate">{child.label}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const logout = useLogout();

  return (
    <aside
      data-testid="sidebar-root"
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

      {/* Navegação agrupada */}
      <nav className="mt-8 flex flex-1 flex-col overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label} className="mb-1 flex flex-col gap-1">
            {!collapsed && (
              <div className="px-3.5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                {section.label}
              </div>
            )}
            {section.items.map((item) => (
              <SidebarItem
                key={item.to}
                item={item}
                collapsed={collapsed}
                onNavigate={(target) => {
                  onMobileClose?.();
                  captureEvent('nav_click', { to: target?.to ?? item.to, label: target?.label ?? item.label });
                }}
              />
            ))}
          </div>
        ))}
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