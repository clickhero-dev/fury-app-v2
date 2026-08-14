<<<<<<< HEAD
=======
import { LayoutDashboard, Megaphone, Palette, Settings, ChevronLeft, CreditCard, X, LogOut, Plug, BrainCircuit, CalendarDays } from 'lucide-react';
>>>>>>> origin/hmg
import { Link, useLocation } from 'react-router-dom';
import {
  CreditCard,
  LayoutGrid,
  LogOut,
  Megaphone,
  Palette,
  Plug,
  Settings,
  BrainCircuit,
  CalendarDays,
  ChevronLeft,
} from 'lucide-react';
import { useState } from 'react';
import { useLogout } from '@/hooks/useLogout';
import { AdySymbol } from '@/components/AdySymbol';
import { SidebarUserCard } from './SidebarUserCard';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

<<<<<<< HEAD
const nav = [
  { to: '/dashboard', label: 'Painel', icon: LayoutGrid },
  { to: '/campanhas', label: 'Campanhas', icon: Megaphone },
  { to: '/planejador', label: 'Planejador IA', icon: BrainCircuit },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays },
  { to: '/estudio', label: 'Estúdio', icon: Palette },
  { to: '/configuracoes/integracoes', label: 'Integrações', icon: Plug },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
  { to: '/assinatura', label: 'Assinatura', icon: CreditCard },
=======
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
  { icon: BrainCircuit, label: 'Planejador IA', path: '/planejador' },
  { icon: CalendarDays, label: 'Calendário', path: '/calendario' },
  { icon: Palette, label: 'Estúdio', path: '/estudio' },
  { icon: Plug, label: 'Integrações', path: '/configuracoes/integracoes' },
  { icon: Settings, label: 'Configurações', path: '/configuracoes' },
  { icon: CreditCard, label: 'Assinatura', path: '/assinatura' },
>>>>>>> origin/hmg
];

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const logout = useLogout();

  return (
    <aside
      className={`
        sticky top-0 h-screen shrink-0 flex-col border-r border-white/5 bg-sidebar px-4 py-6
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-20' : 'w-[264px]'}
        ${mobileOpen ? 'flex fixed inset-y-0 left-0 z-50' : 'hidden md:flex'}
      `}
    >
      {/* Header com Ady centralizado na sidebar */}
      <div className="flex items-center justify-center h-12 w-full">
        <Link to="/dashboard" className="flex items-center justify-center gap-2.5">
          <div className="w-6 h-8 text-primary shrink-0 flex items-center justify-center">
            <AdySymbol />
          </div>
          {!collapsed && (
            <span className="text-3xl font-bold tracking-tight text-foreground lowercase leading-none">
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
              onClick={onMobileClose}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-[#122b2e] text-[#22d3ee] font-semibold'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}
            >
              <Icon
                className={`size-[18px] shrink-0 ${
                  isActive ? 'text-[#22d3ee]' : 'text-muted-foreground'
                }`}
              />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Rodapé com Sair e botão de recuar centralizados */}
      <div className="mt-auto space-y-3 pt-4 border-t border-white/5">
        <SidebarUserCard collapsed={collapsed} />

        {/* Botão Sair */}
        <button
          onClick={() => {
            onMobileClose?.();
            logout();
          }}
          title={collapsed ? 'Sair' : undefined}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <LogOut className="size-[18px] shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>

        {/* Botão Recolher Barra */}
        <div className="hidden md:flex justify-center pt-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
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