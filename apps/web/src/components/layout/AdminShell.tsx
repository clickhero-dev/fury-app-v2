import { useState } from 'react';
import { Users, Clock, Zap, LogOut, LayoutGrid, ArrowLeft } from 'lucide-react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useFavicon } from '@/hooks/useFavicon';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  end?: boolean;
}

const navItems: NavItem[] = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { path: '/admin/users', label: 'Usuários', icon: Users },
  { path: '/admin/planos', label: 'Planos', icon: Clock },
  { path: '/admin', label: 'Campanhas', icon: Zap, end: true },
];

export function AdminShell() {
  // 🟢 Define o Favicon e o Título da aba para a área Admin
  useFavicon('/faviconadmin.svg', 'ADY ADMIN');

  const navigate = useNavigate();
  const location = useLocation();
  const tenantId = location.pathname.match(/\/admin\/tenants\/([^/]+)/)?.[1];
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    navigate('/admin/login');
  };

  const handleCampanhasClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (tenantId) {
      navigate(`/admin/tenants/${tenantId}/campaigns`);
    } else {
      setToastMessage('Selecione um cliente primeiro para ver suas campanhas');
      setTimeout(() => setToastMessage(null), 3000);
      navigate('/admin');
    }
  };

  return (
    <div
      className="min-h-screen bg-[#0C0D0A] text-[#ECEDEF] flex font-sans"
      style={
        {
          '--admin-bg': '#0C0D0A',
          '--admin-sidebar': '#11120E',
          '--admin-border': '#252721',
          '--admin-text': '#ECEDEF',
          '--admin-text-muted': '#8A8F8B',
          '--admin-text-faint': '#4A4F4B',
          '--admin-petrol': '#1E88A8',
        } as React.CSSProperties
      }
    >
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-[#1E88A8] text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium">
          {toastMessage}
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-56 bg-[#11120E] border-r border-[#252721] flex flex-col shrink-0 select-none">
        {/* Header */}
        <div className="px-5 py-5 border-b border-[#252721]">
          <div className="flex items-center gap-2.5 mb-1.5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
              <path
                d="M12 2L3 6.5V12c0 4.97 3.76 9.62 9 10.93C17.24 21.62 21 16.97 21 12V6.5L12 2z"
                fill="rgba(30,136,168,0.2)"
                stroke="#1E88A8"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M9 12l2 2 4-4" stroke="#1E88A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-lg font-bold text-[#ECEDEF] tracking-tight">Ady</span>
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8A8F8B] pl-0.5 mt-1">
            Superadmin
          </div>
        </div>

        {/* Nav */}
        <nav className="px-2.5 py-3 space-y-0.5">
          {navItems.map((item) => {
            if (item.label === 'Campanhas') {
              const isCampanhasActive = location.pathname.includes('/campaigns');
              return (
                <button
                  key={item.label}
                  onClick={handleCampanhasClick}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer ${
                    isCampanhasActive
                      ? 'bg-[#1E88A8]/15 text-[#1E88A8] font-medium'
                      : 'text-[#8A8F8B] hover:text-[#ECEDEF]'
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                  <span>{item.label}</span>
                </button>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                    isActive
                      ? 'bg-[#1E88A8]/15 text-[#1E88A8] font-medium'
                      : 'text-[#8A8F8B] hover:text-[#ECEDEF]'
                  }`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-2.5 py-3 border-t border-[#252721] mt-auto">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#4A4F4B] hover:text-[#ECEDEF] transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.8} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col bg-[#0C0D0A] overflow-hidden">
        {tenantId && (
          <div className="px-6 pt-4 shrink-0">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 text-sm text-[#4A4F4B] hover:text-[#ECEDEF] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
              <Outlet />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}