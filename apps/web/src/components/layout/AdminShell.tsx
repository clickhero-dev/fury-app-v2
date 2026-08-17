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
  { path: '/admin/tenants', label: 'Campanhas', icon: Zap },
];

export function AdminShell() {
  useFavicon('/faviconadmin.svg', 'Ady Admin');

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
      navigate('/admin/tenants');
    }
  };

  return (
    <div className="min-h-screen bg-[#0C0D0A] text-[#ECEDEF] flex font-sans">
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
            <span className="text-lg font-bold tracking-tight">Ady</span>
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-[#8A8F8B] pl-0.5 mt-1">
            Superadmin
          </div>
        </div>

        {/* Nav */}

        <nav className="px-2.5 py-3 space-y-0.5">
  {navItems.map((item) => {
    // Identifica se estamos exatamente na listagem /admin/tenants (sem ID na URL)
    const isExactTenantsList = location.pathname === '/admin/tenants' || location.pathname === '/admin/tenants/';

    // 1. Lógica do botão Campanhas
    if (item.label === 'Campanhas') {
      const isCampanhasActive = location.pathname.includes('/campaigns') || isExactTenantsList;

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

    // 2. Lógica do botão Usuários
    const isUserActive =
      item.path === '/admin/users' &&
      (location.pathname.startsWith('/admin/users') ||
        (location.pathname.startsWith('/admin/tenants') && !isExactTenantsList && !location.pathname.includes('/campaigns')));

    return (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.end}
        className={({ isActive }) =>
          `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
            isActive || isUserActive
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
      <main className="flex-1 flex flex-col bg-[#0C0D0A] overflow-hidden text-[#ECEDEF]">
      {tenantId && (
    <div className="px-6 pt-4 shrink-0">
      <button
        onClick={() => {
          // Se a intenção for voltar na navegação anterior (ex: tela de usuários):
          navigate(-1); 
          // Caso queira forçar a ida direta para a lista principal, use: navigate('/admin/tenants');
        }}
        className="flex items-center gap-2 text-sm text-[#4A4F4B] hover:text-[#ECEDEF] transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar para Clientes
      </button>
    </div>
     )}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="dark p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
              <Outlet />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}