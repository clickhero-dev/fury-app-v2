import { useState } from 'react';
import { useLogout } from '@/hooks/useLogout';
import { Users, Clock, Zap, LogOut, LayoutGrid, ArrowLeft, Ticket, CircleHelp, Activity, Megaphone, MonitorSmartphone, Briefcase, Building2, KeyRound } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useFavicon } from '@/hooks/useFavicon';
import { SnackHost } from './SnackHost';
import { useBlockedViews } from '@/hooks/useBlockedViews';
import { viewKeyForPath } from '@/lib/rbac-views';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { getStoredPlatformRole } from '@/lib/platform-role';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  end?: boolean;
}

const navItems: NavItem[] = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { path: '/admin/clientes', label: 'Clientes', icon: Building2 },
  { path: '/admin/users', label: 'Usuários', icon: Users },
  { path: '/admin/planos', label: 'Planos', icon: Clock },
  { path: '/admin/tickets', label: 'Tickets', icon: Ticket },
  { path: '/admin/healthchecks', label: 'Healthchecks', icon: Activity },
  { path: '/admin/faqs', label: 'FAQs', icon: CircleHelp },
  { path: '/admin/avisos', label: 'Avisos', icon: Megaphone },
  { path: '/admin/tenants', label: 'Campanhas', icon: Zap },
  { path: '/admin/parceiros', label: 'Parceiros', icon: Briefcase },
  { path: '/admin/integracoes', label: 'Integrações', icon: KeyRound },
];

// Telas da ady como um todo: só super_admin (a API também recusa)
const SUPER_ADMIN_ONLY = ['/admin/tickets', '/admin/healthchecks', '/admin/faqs', '/admin/avisos', '/admin/parceiros'];

// Telas só do parceiro (admin_partner)
const PARTNER_ONLY = ['/admin/clientes', '/admin/integracoes'];

function isPartnerOnly(pathname: string): boolean {
  return PARTNER_ONLY.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isSuperAdminOnly(pathname: string): boolean {
  return SUPER_ADMIN_ONLY.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function AdminShell() {
  useFavicon('/faviconadmin.svg', 'Ady Admin');

  const navigate = useNavigate();
  const location = useLocation();
  const tenantId = location.pathname.match(/\/admin\/tenants\/([^/]+)/)?.[1];
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { isBlocked } = useBlockedViews();
  const viewKey = viewKeyForPath(location.pathname);
  const isSuperAdmin = getStoredPlatformRole() === 'super_admin';
  const isPartner = getStoredPlatformRole() === 'admin_partner';
  const isVisible = (item: NavItem) => {
    if (!isSuperAdmin && isSuperAdminOnly(item.path)) return false;
    if (!isPartner && isPartnerOnly(item.path)) return false;
    const key = viewKeyForPath(item.path);
    return !key || !isBlocked(key);
  };
  const isPageBlocked =
    (!isSuperAdmin && isSuperAdminOnly(location.pathname)) ||
    (!isPartner && isPartnerOnly(location.pathname)) ||
    (viewKey !== null && isBlocked(viewKey));
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const logout = useLogout('/admin/login');
  const handleLogout = () => {
    setLogoutDialogOpen(false);
    logout();
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
    <div className="min-h-screen bg-background text-text-primary flex font-sans">
      <SnackHost />
      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent aria-describedby="admin-logout-description">
          <DialogHeader><DialogTitle>Sair da conta?</DialogTitle><DialogDescription id="admin-logout-description">Você realmente deseja sair?</DialogDescription></DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setLogoutDialogOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Cancelar</button>
            <button type="button" onClick={handleLogout} className="rounded-lg bg-brand px-4 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Sim, sair</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-[#17708A] text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium">
          {toastMessage}
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-56 bg-sidebar border-r border-border flex flex-col shrink-0 select-none">
        {/* Header */}
        <div className="px-5 py-5 border-b border-border">
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
          <div className="text-[9px] font-semibold uppercase tracking-wider text-text-tertiary pl-0.5 mt-1">
            {isSuperAdmin ? 'Superadmin' : 'Parceiro'}
          </div>
        </div>

        {/* Nav */}

        <nav className="px-2.5 py-3 space-y-0.5">
  {navItems.filter(isVisible).map((item) => {
    // Identifica se estamos exatamente na listagem /admin/tenants (sem ID na URL)
    const isExactTenantsList = location.pathname === '/admin/tenants' || location.pathname === '/admin/tenants/';

    // 1. Lógica do botão Campanhas
    if (item.label === 'Campanhas') {
      const isCampanhasActive = location.pathname.includes('/campaigns') || isExactTenantsList;

      return (
        <button
          key={item.label}
          onClick={handleCampanhasClick}
          className={`ady-btn w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer ${
            isCampanhasActive
              ? 'bg-sidebar-active text-[#17708A] dark:text-[#2A9BC0] font-semibold'
              : 'text-text-secondary hover:bg-sidebar-hover hover:text-text-primary'
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
              ? 'bg-sidebar-active text-[#17708A] dark:text-[#2A9BC0] font-semibold'
              : 'text-text-secondary hover:bg-sidebar-hover hover:text-text-primary'
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
        <div className="px-2.5 py-3 border-t border-border mt-auto space-y-2">
          <Link
            to="/dashboard"
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-2.5 text-sm font-medium text-brand hover:bg-brand/20 transition-colors"
          >
            <MonitorSmartphone className="size-[18px] shrink-0 text-brand" strokeWidth={1.8} />
            <span>Ir para a plataforma</span>
          </Link>
          <button
            onClick={() => setLogoutDialogOpen(true)}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-error/20 bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error hover:bg-error/20 transition-colors cursor-pointer"
          >
            <LogOut className="size-[18px] shrink-0 text-error" strokeWidth={1.8} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col bg-background overflow-hidden text-text-primary">
      {tenantId && (
    <div className="px-6 pt-4 shrink-0">
      <button
        onClick={() => {
          // Se a intenção for voltar na navegação anterior (ex: tela de usuários):
          navigate(-1); 
          // Caso queira forçar a ida direta para a lista principal, use: navigate('/admin/tenants');
        }}
        className="flex items-center gap-2 text-sm text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar para Clientes
      </button>
    </div>
     )}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
              {isPageBlocked ? <NotFoundPage /> : <Outlet />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
