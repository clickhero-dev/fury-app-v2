import { LayoutDashboard, Megaphone, Palette, Settings, ChevronLeft, Zap, CreditCard } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { PlanBadge } from './PlanBadge';

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Megaphone, label: 'Campanhas', path: '/campanhas' },
  { icon: Zap, label: 'Automação', path: '/automacao/minhas-regras' },
  { icon: Palette, label: 'Estúdio', path: '/estudio' },
  { icon: Settings, label: 'Configurações', path: '/configuracoes' },
  { icon: CreditCard, label: 'Assinatura', path: '/assinatura' },
];

export function Sidebar({ onToggle }: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const handleToggle = () => {
    setCollapsed(!collapsed);
    onToggle?.();
  };

  return (
    <aside
      className={`bg-sidebar text-white transition-all duration-300 ease-out min-h-screen flex flex-col border-r border-sidebar-hover ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="p-6 flex items-center justify-between">
        {!collapsed && <h1 className="text-xl font-bold tracking-wider !text-white">FURY</h1>}
      </div>

      <nav className="flex-1 px-3 space-y-1">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <li key={item.label}>
                <Link
                  to={item.path}
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

      <div className="pb-3 space-y-2">
        <PlanBadge collapsed={collapsed} />
        <div className="px-3 border-t border-sidebar-hover pt-3">
          <button
            onClick={handleToggle}
            className="w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-white/85 hover:bg-sidebar-hover hover:text-white transition-colors"
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