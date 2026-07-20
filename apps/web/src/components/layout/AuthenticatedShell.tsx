import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '../Sidebar';
import api from '../../lib/api';
import { useSubscription } from '../../hooks/useBilling';
import { useAppDispatch } from '../../store/hooks';
import { setMetaId, setPlan } from '../../store/slices/authSlice';

/**
 * Contexto disponível para rotas filhas via `useOutletContext`.
 * Permite que páginas internas controlem a abertura da sidebar mobile.
 */
export type ShellContext = {
  setMobileOpen: (open: boolean) => void;
};

/**
 * Rotas que não devem disparar o redirecionamento de onboarding.
 * Billing é isento para que usuários sem conta Meta possam acessar planos e assinar.
 */
const ONBOARDING_EXEMPT = ['/assinatura', '/planos'];

/**
 * Layout principal da aplicação para usuários autenticados.
 *
 * Responsabilidades:
 * 1. **Autenticação:** Redireciona para `/login` se não houver token JWT.
 * 2. **Onboarding:** Verifica se o usuário tem conta Meta conectada e ad account selecionado.
 * - Sem conexão Meta → redireciona para `/onboarding/conectar-meta`
 * - Sem ad account selecionado → redireciona para `/onboarding/selecionar-conta`
 * 3. **Layout:** Renderiza a Sidebar e o `<Outlet />` com o conteúdo da rota ativa.
 * 4. **Mobile:** Gerencia o estado de abertura da sidebar em dispositivos móveis,
 * incluindo overlay de fundo ao abrir.
 *
 * Rotas isentas do check de onboarding: `/assinatura` e `/planos`.
 * Rotas de onboarding também são isentas para evitar loop de redirecionamento.
 *
 * O status de conexão Meta é cacheado no localStorage (`fury-meta-connected`)
 * para evitar flash de redirecionamento em recarregamentos.
 *
 * @example
 * // Usado no router.tsx como elemento pai das rotas autenticadas
 * {
 * element: <AuthenticatedShell />,
 * children: [
 * { path: '/dashboard', element: <Dashboard /> },
 * ...
 * ]
 * }
 */
export function AuthenticatedShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const token = localStorage.getItem('token');
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const isDemoUser = false;
  const isOnboarding = location.pathname.startsWith('/onboarding');
  const isExempt = ONBOARDING_EXEMPT.some((p) => location.pathname.startsWith(p));
  const isSubscriptionExempt =
    isExempt || location.pathname.startsWith('/assinatura-vencida');

  // Só verifica conexão Meta se autenticado, fora de rotas isentas/onboarding e se não for usuário demo
  const shouldCheck = !!token && !isOnboarding && !isExempt && !isDemoUser;
  const shouldCheckSubscription = !!token && !isOnboarding && !isSubscriptionExempt && !isDemoUser;

  const { data: connections, isLoading, isFetched } = useQuery({
    queryKey: ['meta-connections'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; selectedAdAccountId: string | null }> }>(
        '/meta/connections'
      );
      const data = res.data.data;
      if (Array.isArray(data) && data.length > 0) {
        // Persiste flag no localStorage para evitar flash de redirecionamento
        localStorage.setItem('fury-meta-connected', 'true');
      }
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: shouldCheck,
    retry: false,
    // Usa cache do localStorage como placeholder para evitar redirecionamento prematuro
    placeholderData:
      localStorage.getItem('fury-meta-connected') === 'true'
        ? [{ id: 'cached', selectedAdAccountId: 'cached' }]
        : undefined,
  });

  useEffect(() => {
    if (!isLoading && isFetched && shouldCheck && Array.isArray(connections)) {
      if (connections.length > 0) {
        dispatch(setMetaId(connections[0].id ?? null));
      }
      if (connections.length === 0) {
        navigate('/onboarding/conectar-meta', { replace: true });
      } else if (!connections.some((conn) => conn.selectedAdAccountId)) {
        navigate('/onboarding/selecionar-conta', { replace: true });
      }
    }
  }, [connections, isLoading, isFetched, shouldCheck, navigate, dispatch]);

  // ── Verificação de assinatura (deve vir ANTES do check de Meta) ──────
  const {
    data: subscription,
    isLoading: subLoading,
    isFetched: subFetched,
  } = useSubscription();

  const isExpired = useMemo(() => {
    if (!subscription) return false;

    const now = new Date();

    if (['cancelled', 'inactive', 'past_due'].includes(subscription.status)) {
      return true;
    }
    if (
      subscription.status === 'trial' &&
      subscription.trialEndsAt &&
      now > new Date(subscription.trialEndsAt)
    ) {
      return true;
    }
    if (
      subscription.status === 'active' &&
      subscription.currentPeriodEnd &&
      now > new Date(subscription.currentPeriodEnd)
    ) {
      return true;
    }

    return false;
  }, [subscription]);

  const subscriptionChecked =
    !subLoading && subFetched;

  useEffect(() => {
    if (subscription && subscriptionChecked) {
      const planName = subscription.plan?.name ?? null;
      const expiration = subscription.trialEndsAt ?? subscription.currentPeriodEnd ?? null;
      dispatch(setPlan({ plan: planName, planExpiration: expiration }));
    }
  }, [subscription, subscriptionChecked, dispatch]);

  if (subscriptionChecked && shouldCheckSubscription && isExpired) {
    return <Navigate to="/assinatura-vencida" replace />;
  }

  // Sem token — redireciona para login
  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Overlay escuro ao abrir sidebar no mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      {/* Outlet renderiza a página da rota ativa com acesso ao ShellContext */}
      <Outlet context={{ setMobileOpen } satisfies ShellContext} />
    </div>
  );
}