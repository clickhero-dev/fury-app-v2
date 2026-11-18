import { useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '../Sidebar';
import { SnackHost } from './SnackHost';
import { AnnouncementsModal } from './AnnouncementsModal';
import { NotificationsBell } from '../notifications/NotificationsBell';
import { FabActions } from '../fab/FabActions';
import api from '../../lib/api';
import { useSubscription } from '../../hooks/useBilling';
import { useBlockedViews } from '../../hooks/useBlockedViews';
import { viewKeyForPath } from '../../lib/rbac-views';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { TrialPasswordModal } from './TrialPasswordModal';
import { canAccessAdmin, getStoredPlatformRole, hasLifetimeAccess, isBillingPath, isIntegrationsPath, isMemberAccount } from '../../lib/platform-role';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setMetaId, setPlan, selectIsPlanExpired, selectUserRole, selectNeedsPolicyAcceptance, setPolicyAccepted } from '../../store/slices/authSlice';
import {
  computeSubscriptionState,
  getSubscriptionExpiration,
  shouldRedirectToExpired,
} from './subscriptionGuard';

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
 * Rotas isentas do gate da política de uso. /politica é o próprio destino
 * do aceite; /assinatura-vencida e billing permanecem acessíveis.
 */
const POLICY_EXEMPT = ['/politica', '/assinatura-vencida', '/assinatura', '/planos'];

interface PolicyCurrentData {
  currentVersion: string | null;
  currentVersionId: string | null;
  accepted: boolean;
  content: string | null;
}

/**
 * Layout principal da aplicação ady para usuários autenticados.
 */
export function AuthenticatedShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const token = localStorage.getItem('token');
  const location = useLocation();
  const dispatch = useAppDispatch();

  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') ?? '{}') as { type?: string }; } catch { return {}; }
  })();
  // A flag antiga só mantém compatibilidade com sessões já abertas; APIs e
  // datasets demo continuam protegidos pela identidade persistida no backend.
  const isDemoUser = storedUser.type === 'demo' || localStorage.getItem('ady-demo-session') === 'true';
  // O role vem da sessão assinada pelo backend; o frontend apenas espelha o
  // modo para evitar gates de onboarding/Meta que não existem na demonstração.
  const userRole = useAppSelector(selectUserRole);
  const isDemoSession = userRole === 'demo' || isDemoUser;
  const isPublicTrial = localStorage.getItem('fury-public-trial') === 'true';
  const [showTrialPasswordModal, setShowTrialPasswordModal] = useState(() => localStorage.getItem('fury-trial-password-pending') === 'true');
  const isOnboarding = location.pathname.startsWith('/onboarding');
  const isExempt = ONBOARDING_EXEMPT.some((p) => location.pathname.startsWith(p));
  const isSubscriptionExempt =
    isExempt || location.pathname.startsWith('/assinatura-vencida');

  // ── Gate da política de uso ──────────────────────────────────────────────
  // Estado conhecido vem do login (embutido na resposta) ou do localStorage
  // (persistido) — ZERO chamadas extras. Sessão antiga (null) busca
  // /policy/current uma única vez para decidir (sem loop: /politica é isenta).
  const isPolicyRoute = location.pathname.startsWith('/politica');
  const isPolicyExempt =
    isPolicyRoute || POLICY_EXEMPT.some((p) => location.pathname.startsWith(p)) || isOnboarding || isDemoSession;
  const needsPolicy = useAppSelector(selectNeedsPolicyAcceptance);
  const { isBlocked } = useBlockedViews();
  const viewKey = viewKeyForPath(location.pathname);

  const shouldCheckPolicy = !!token && !isPolicyExempt;

  // Sessão antiga: resolve o estado uma vez e grava no slice (persistido).
  const { data: policyResolved } = useQuery({
    queryKey: ['policy-current'],
    queryFn: async () => {
      const res = await api.get<{ data: PolicyCurrentData }>('/policy/current');
      const d = res.data.data;
      dispatch(
        setPolicyAccepted({ currentVersion: d.currentVersion, accepted: d.accepted })
      );
      return d;
    },
    enabled: shouldCheckPolicy && needsPolicy === null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const policyPending =
    shouldCheckPolicy && (needsPolicy === true || (needsPolicy === null && policyResolved?.accepted === false));

  // ── Verificação de conexão Meta ──────
  const shouldCheck = !!token && !isOnboarding && !isExempt && !isDemoSession && !isPublicTrial;
  const shouldCheckSubscription = !!token && !isOnboarding && !isSubscriptionExempt && !isDemoSession;

  const { data: connections, isLoading, isFetched } = useQuery({
    queryKey: ['meta-connections'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; selectedAdAccountId: string | null }> }>(
        '/meta/connections'
      );
      const data = res.data.data;
      if (Array.isArray(data) && data.length > 0) {
        // Persiste flag no localStorage
        localStorage.setItem('ady-meta-connected', 'true');
      }
      return data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: shouldCheck,
    retry: false,
    placeholderData:
      localStorage.getItem('ady-meta-connected') === 'true' ||
      localStorage.getItem('fury-meta-connected') === 'true'
        ? [{ id: 'cached', selectedAdAccountId: 'cached' }]
        : undefined,
  });

  useEffect(() => {
    if (!isLoading && isFetched && shouldCheck && Array.isArray(connections)) {
      if (connections.length > 0) {
        dispatch(setMetaId(connections[0].id ?? null));
      }
    }
  }, [connections, isLoading, isFetched, shouldCheck, dispatch]);

  // ── Verificação de assinatura ──────
  const {
    data: subscription,
    isLoading: subLoading,
    isFetched: subFetched,
    isError: subError,
  } = useSubscription();

  const reduxPlanExpired = useAppSelector(selectIsPlanExpired);
  // Isentos de bloqueio por plano (mesma regra do backend checkSubscriptionActive).
  const isAdmin = userRole === 'admin' || canAccessAdmin(getStoredPlatformRole());

  const subscriptionState = useMemo(
    () => computeSubscriptionState(subscription),
    [subscription]
  );

  const subscriptionChecked = !subLoading && subFetched;

  // Persiste o plano (ou sua ausência) no Redux apenas quando o fetch de assinatura
  // resolveu e NÃO foi erro — assim registra o estado real sem sobrescrever um valor
  // válido quando a API falha (500 etc).
  useEffect(() => {
    if (subscriptionChecked && !subError) {
      const planName = subscription?.plan?.name ?? null;
      const expiration = getSubscriptionExpiration(subscription);
      dispatch(setPlan({ plan: planName, planExpiration: expiration }));
    }
  }, [subscription, subscriptionChecked, subError, dispatch]);

  // Redireciona para /assinatura-vencida apenas com evidência confiável, e NUNCA para
  // admin/superadmin (isenção do backend). Uma assinatura ativa confirmada prevalece
  // sobre uma data antiga; em caso de erro, conserva o último estado persistido.
  const redirectToExpired = shouldRedirectToExpired({
    subscriptionChecked: subscriptionChecked && !subError,
    state: subError ? 'none' : subscriptionState,
    reduxPlanExpired,
  });

  if (shouldCheckSubscription && !isAdmin && redirectToExpired) {
    return <Navigate to="/assinatura-vencida" replace />;
  }

  // ── Gate da política: usuário pendente vai para /politica (antes de qualquer conteúdo) ──
  /* Temporariamente desabilitado para reduzir atrito no acesso.
  if (policyPending) {
    return <Navigate to="/politica" state={location.state} replace />;
  }
  */

  // Sem token — redireciona para login
  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-background text-text-primary">
      {/* Temporariamente desabilitado para reduzir atrito no acesso.
      {showTrialPasswordModal && <TrialPasswordModal onComplete={() => { localStorage.removeItem('fury-trial-password-pending'); setShowTrialPasswordModal(false); }} />}
      */}
      {/* Overlay escuro ao abrir sidebar no mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <NotificationsBell />
      <SnackHost />
      <AnnouncementsModal enabled={!isOnboarding} />
      {/* Ações flutuantes de criação (fora das rotas: sobrevivem à navegação).
          FabActions retorna null em telas onde não fazem sentido. */}
      <FabActions />
      {/* Outlet renderiza a página da rota ativa com acesso ao ShellContext */}
      {(viewKey && isBlocked(viewKey)) || (hasLifetimeAccess() && isBillingPath(location.pathname)) || (isMemberAccount() && isIntegrationsPath(location.pathname)) ? (
        <div className="flex-1"><NotFoundPage /></div>
      ) : (
        <Outlet context={{ setMobileOpen } satisfies ShellContext} />
      )}
    </div>
  );
}
