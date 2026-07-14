import { useEffect, useState } from 'react';
import { Shield, Users, Settings, Zap, ArrowLeft } from 'lucide-react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import api from '@/lib/api';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className: string }>;
  end?: boolean;
}

const navItems: NavItem[] = [
  { path: '/admin/users', label: 'Usuários', icon: Users },
  // "Planos" gerencia planos e configurações globais do sistema
  { path: '/admin/planos', label: 'Planos', icon: Settings },
  // "Campanhas" recebe tratamento especial via handleCampanhasClick — ver comentário abaixo
  { path: '/admin', label: 'Campanhas', icon: Zap, end: true },
];

export function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  // ponytail: useParams() no layout /admin sempre retorna vazio —
  // extrai tenantId do pathname real (/admin/tenants/:id/...)
  const tenantId = location.pathname.match(/\/admin\/tenants\/([^/]+)/)?.[1];
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Se está em uma rota de tenant (/admin/tenants/:id/*), carrega o nome do tenant
  useEffect(() => {
    if (tenantId) {
      setLoadingTenant(true);
      api
        .get(`/admin/tenants/${tenantId}`)
        .then((res) => {
          setTenantName(res.data.data?.name || null);
        })
        .catch(() => {
          setTenantName(null);
        })
        .finally(() => {
          setLoadingTenant(false);
        });
    } else {
      setTenantName(null);
    }
  }, [tenantId]);

  // Limpa toast após 3 segundos
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    navigate('/admin/login');
  };

  // Decisão arquitetural: campanhas são um resource aninhado a um tenant
  // (/admin/tenants/:id/campaigns). O botão "Campanhas" na sidebar global
  // se comporta de forma contextual:
  // - Se já estamos dentro de um tenant (tenantId presente via useParams),
  //   navega direto para as campanhas DAQUELE tenant.
  // - Se não há tenant selecionado (estamos na lista global /admin, por
  //   exemplo), mostra um toast avisando e manda para a lista de tenants,
  //   já que não há campanhas "globais" para mostrar.
  const handleCampanhasClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (tenantId) {
      navigate(`/admin/tenants/${tenantId}/campaigns`);
    } else {
      setToastMessage('Selecione um cliente primeiro para ver suas campanhas');
      navigate('/admin');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-amber-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
        <div className="flex items-center gap-3 px-6 h-16 border-b border-zinc-800">
          <Shield className="w-5 h-5 text-amber-500" />
          <span className="font-bold text-zinc-100 text-sm tracking-wider">FURY ADMIN</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            // Campanhas recebe tratamento especial
            if (item.label === 'Campanhas') {
              return (
                <button
                  key={item.label}
                  onClick={handleCampanhasClick}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-600/10 text-amber-400 border border-amber-600/20'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2.5 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Header com título de tenant e botão voltar (quando em rotas aninhadas) */}
        {tenantId && (
          <header className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4 lg:py-5">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate('/admin')}
                  className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Voltar para lista de tenants"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>
                <div className="hidden sm:block pl-4 border-l border-zinc-800">
                  {loadingTenant ? (
                    <p className="text-sm text-zinc-400">Carregando...</p>
                  ) : tenantName ? (
                    <p className="text-sm font-medium text-zinc-300">{tenantName}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Conteúdo da rota */}
        <div className="flex-1 p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}