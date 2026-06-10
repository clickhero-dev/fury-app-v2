import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '../Sidebar';
import api from '../../lib/api';

export type ShellContext = {
  setMobileOpen: (open: boolean) => void;
};

const ONBOARDING_EXEMPT = ['/assinatura', '/planos'];

export function AuthenticatedShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const token = localStorage.getItem('token');
  const location = useLocation();
  const navigate = useNavigate();

  const isOnboarding = location.pathname.startsWith('/onboarding');
  const isExempt = ONBOARDING_EXEMPT.some((p) => location.pathname.startsWith(p));
  const shouldCheck = !!token && !isOnboarding && !isExempt;

  const { data: connections, isLoading, isFetched } = useQuery({
    queryKey: ['meta-connections'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ selectedAdAccountId: string | null }> }>('/meta/connections');
      const data = res.data.data;
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem('fury-meta-connected', 'true');
      }
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: shouldCheck,
    retry: false,
    placeholderData: localStorage.getItem('fury-meta-connected') === 'true'
      ? [{ selectedAdAccountId: 'cached' }]
      : undefined,
  });

  useEffect(() => {
    if (!isLoading && isFetched && shouldCheck && Array.isArray(connections)) {
      if (connections.length === 0) {
        navigate('/onboarding/conectar-meta', { replace: true });
      } else if (!connections.some((conn) => conn.selectedAdAccountId)) {
        navigate('/onboarding/selecionar-conta', { replace: true });
      }
    }
  }, [connections, isLoading, isFetched, shouldCheck, navigate]);

  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-surface">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <Outlet context={{ setMobileOpen } satisfies ShellContext} />
    </div>
  );
}
