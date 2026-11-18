/* # language: pt-BR
Funcionalidade: Home protegida e independente do plano
  Cenário: Trial, pago, demo, plano ausente e consulta indisponível chegam à Home
  Cenário: vencimento confirmado ou persistido continua bloqueando o acesso
  Cenário: visitante autentica e conserva o destino completo
  Cenário: autorização continua sendo aplicada nas ferramentas
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import authReducer from '../../store/slices/authSlice';
import { AuthenticatedShell } from './AuthenticatedShell';
import { InitialDestinationPage } from '../../pages/auth/InitialDestinationPage';
import { consumeLoginDestination } from '../../pages/auth/initialDestination';

const state = vi.hoisted(() => ({ subscription: {} as Record<string, unknown>, blocked: false }));
vi.mock('../../hooks/useBilling', () => ({ useSubscription: () => state.subscription }));
vi.mock('../../hooks/useBlockedViews', () => ({ useBlockedViews: () => ({ isBlocked: () => state.blocked }) }));
vi.mock('../../lib/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));
vi.mock('../Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./SnackHost', () => ({ SnackHost: () => null }));
vi.mock('./AnnouncementsModal', () => ({ AnnouncementsModal: () => null }));
vi.mock('../notifications/NotificationsBell', () => ({ NotificationsBell: () => null }));
vi.mock('../fab/FabActions', () => ({ FabActions: () => null }));
vi.mock('../../pages/NotFoundPage', () => ({ NotFoundPage: () => <p>Sem acesso à ferramenta</p> }));

function entry({ token = true, role = 'owner', expiration = null as string | null, path = '/inicio' } = {}) {
  if (token) localStorage.setItem('token', 'test-session');
  const store = configureStore({ reducer: { auth: authReducer } });
  // Reducer reads the session on import; use the same login/plan actions as the app.
  store.dispatch({ type: 'auth/login', payload: { token: token ? 'test-session' : null, role, tenantId: 'test', policy: { currentVersion: '1', accepted: true } } });
  store.dispatch({ type: 'auth/setPlan', payload: { plan: null, planExpiration: expiration } });
  if (!token) localStorage.removeItem('token');
  return render(<Provider store={store}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes>
      <Route element={<AuthenticatedShell />}>
        <Route path="/inicio" element={<InitialDestinationPage />} />
        <Route path="/estudio/imagem" element={<p>Ferramenta</p>} />
      </Route>
      <Route path="/login" element={<p>Autenticar</p>} />
      <Route path="/assinatura-vencida" element={<p>Assinatura vencida</p>} />
      <Route path="/admin/dashboard" element={<p>Área superadmin</p>} />
    </Routes></MemoryRouter>
  </QueryClientProvider></Provider>);
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); state.blocked = false;
  state.subscription = { data: null, isLoading: false, isFetched: true, isError: false };
});

describe('destino protegido da Home', () => {
  it.each(['trial', 'active', 'demo', 'ausente', 'erro'])('chega à Home com %s', async scenario => {
    state.subscription = { ...state.subscription, data: ['trial', 'active'].includes(scenario) ? { status: scenario, trialEndsAt: '2100-01-01', currentPeriodEnd: '2100-01-01' } : null, isError: scenario === 'erro' };
    entry({ role: scenario === 'demo' ? 'demo' : 'owner' });
    expect(await screen.findByRole('heading', { name: 'O que vamos fazer hoje?' })).toBeInTheDocument();
  });
  it.each(['cancelled', 'past_due', 'inactive', 'trial'])('preserva bloqueio por %s', async status => {
    state.subscription = { ...state.subscription, data: { status, trialEndsAt: '2000-01-01' } };
    entry();
    expect(await screen.findByText('Assinatura vencida')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'O que vamos fazer hoje?' })).not.toBeInTheDocument();
  });
  it('preserva vencimento conhecido se a consulta falha', async () => {
    state.subscription = { ...state.subscription, isError: true };
    entry({ expiration: '2000-01-01' });
    expect(await screen.findByText('Assinatura vencida')).toBeInTheDocument();
  });
  it('exige login e guarda query/hash do destino protegido', async () => {
    entry({ token: false, path: '/estudio/imagem?origem=link#criar' });
    expect(await screen.findByText('Autenticar')).toBeInTheDocument();
    expect(consumeLoginDestination()).toBe('/estudio/imagem?origem=link#criar');
  });
  it('exige login para a própria Home', async () => {
    entry({ token: false });
    expect(await screen.findByText('Autenticar')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'O que vamos fazer hoje?' })).not.toBeInTheDocument();
  });
  it('mantém a área superadmin separada', async () => {
    localStorage.setItem('user', JSON.stringify({ platformRole: 'super_admin' }));
    entry();
    expect(await screen.findByText('Área superadmin')).toBeInTheDocument();
  });
  it('não contorna autorização ao abrir ferramenta', async () => {
    state.blocked = true;
    state.subscription = { ...state.subscription, data: { status: 'active' } };
    entry({ path: '/estudio/imagem' });
    expect(await screen.findByText('Sem acesso à ferramenta')).toBeInTheDocument();
    expect(screen.queryByText('Ferramenta')).not.toBeInTheDocument();
  });
});
