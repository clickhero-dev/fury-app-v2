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

  const { data: connections } = useQuery({
    queryKey: ['meta-connections'],
    queryFn: async () => {
      const res = await api.get<{ data: unknown[] }>('/meta/connections');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: shouldCheck,
    retry: false,
  });

  useEffect(() => {
    if (shouldCheck && Array.isArray(connections) && connections.length === 0) {
      navigate('/onboarding/conectar-meta', { replace: true });
    }
  }, [connections, shouldCheck, navigate]);

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
