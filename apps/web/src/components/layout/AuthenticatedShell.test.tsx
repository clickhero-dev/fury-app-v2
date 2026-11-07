import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Reducer } from 'redux';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import authReducer, { setPolicyAccepted, login as loginAction } from '../../store/slices/authSlice';
import type { AuthState } from '../../store/slices/authSlice';

const { billingState } = vi.hoisted(() => ({
  billingState: { data: null as { status: string } | null, isLoading: false, isFetched: false, isError: false },
}));

/*
Funcionalidade: proteger o shell e liberar o Trial confirmado sem Meta
Cenário: usuário com política pendente vai para /politica
  Dado que o estado autenticado informa aceite pendente
  Quando o shell é aberto
  Então a rota de política aparece e o conteúdo protegido fica oculto
Cenário: Trial confirmado acessa o dashboard sem Meta
  Dado que a API confirma assinatura Trial e não há conexão Meta
  Quando o shell é aberto
  Então o dashboard aparece sem chamar o onboarding Meta
Cenário: flag local não concede bypass a outra assinatura
  Dado que a API confirma assinatura ativa e existe uma flag local de Trial
  Quando não há conexão Meta
  Então o usuário continua direcionado ao onboarding Meta
*/

// mock da api: roteia por URL — /policy/current configurável por teste
const apiGet = vi.fn();
apiGet.mockImplementation((url: string) => {
  if (url === '/policy/current') {
    return Promise.resolve({
      data: { data: { currentVersion: '1.0', currentVersionId: 'v1', accepted: true, content: 'texto' } },
    });
  }
  // /meta/connections e outros: conexão existente (evita redirect de onboarding)
  return Promise.resolve({ data: { data: [{ id: 'c1', selectedAdAccountId: 'acc-1' }] } });
});

vi.mock('../../lib/api', () => ({
  default: { get: (...args: unknown[]) => apiGet(...args) },
}));

vi.mock('../../hooks/useBilling', () => ({
  useSubscription: () => billingState,
}));

vi.mock('../../lib/posthog', () => ({ captureEvent: vi.fn() }));

import { AuthenticatedShell } from './AuthenticatedShell';

function makeStore(policy: AuthState['policy'], withToken = true, role = 'owner') {
  return configureStore({
    reducer: { auth: authReducer as Reducer<AuthState> },
    preloadedState: {
      auth: {
        token: withToken ? 'tok' : null,
        refreshToken: withToken ? 'ref' : null,
        name: 'Ana',
        email: 'a@b.com',
        role,
        tenantId: 't1',
        metaId: null,
        plan: 'Pro',
        planExpiration: new Date(Date.now() + 30 * 864e5).toISOString(),
        policy,
        theme: 'dark' as const,
      },
    },
  });
}

function renderShell(policy: AuthState['policy'], role = 'owner', metaConnected = true) {
  // O shell lê o token do localStorage (não do Redux) — seed obrigatório.
  localStorage.setItem('token', 'tok');
  if (metaConnected) localStorage.setItem('ady-meta-connected', 'true');
  const store = makeStore(policy, true, role);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            {/* /politica fora do shell, como no router real */}
            <Route path="/politica" element={<div data-testid="politica-page" />} />
            <Route path="/onboarding/conectar-meta" element={<div data-testid="meta-onboarding-page" />} />
            <Route path="*" element={<AuthenticatedShell />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

beforeEach(() => {
  localStorage.clear();
  billingState.data = null;
  billingState.isLoading = false;
  billingState.isFetched = false;
  billingState.isError = false;
  apiGet.mockReset();
  apiGet.mockImplementation((url: string) => {
    if (url === '/policy/current') {
      return Promise.resolve({
        data: { data: { currentVersion: '1.0', currentVersionId: 'v1', accepted: true, content: 'texto' } },
      });
    }
    // /meta/connections e outros: conexão existente (evita redirect de onboarding)
    return Promise.resolve({ data: { data: [{ id: 'c1', selectedAdAccountId: 'acc-1' }] } });
  });
});

describe('AuthenticatedShell — gate de política de uso', () => {
  /** Conta apenas chamadas a /policy/current (meta-connections é query legítima do shell). */
  function policyCalls() {
    return apiGet.mock.calls.filter((c) => c[0] === '/policy/current');
  }

  it('usuário pendente (accepted=false) é redirecionado para /politica', async () => {
    renderShell({ currentVersion: '1.0', accepted: false });

    // Redirect síncrono no primeiro render: /politica monta, o shell desmonta.
    expect(await screen.findByTestId('politica-page')).not.toBeNull();
    expect(screen.queryByTestId('sidebar-root')).toBeNull();
    expect(policyCalls()).toHaveLength(0); // estado conhecido → zero fetch
  });

  it('usuário aceito vê o conteúdo sem nenhuma chamada a /policy/current (sem over-fetching)', async () => {
    renderShell({ currentVersion: '1.0', accepted: true });

    expect(await screen.findByTestId('sidebar-root')).not.toBeNull();
    expect(screen.queryByTestId('politica-page')).toBeNull();
    expect(policyCalls()).toHaveLength(0);
  });

  it('Cenário: usuário demo acessa o dashboard sem consultar conexão Meta', async () => {
    renderShell({ currentVersion: '1.0', accepted: true }, 'demo');

    expect(await screen.findByTestId('sidebar-root')).not.toBeNull();
    expect(apiGet.mock.calls.some((call) => call[0] === '/meta/connections')).toBe(false);
  });

  it('sessão antiga (policy=null) busca /policy/current UMA vez e bloqueia quando pendente', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === '/policy/current') {
        return Promise.resolve({
          data: { data: { currentVersion: '1.0', currentVersionId: 'v1', accepted: false, content: 'texto' } },
        });
      }
      return Promise.resolve({ data: { data: [{ id: 'c1', selectedAdAccountId: 'acc-1' }] } });
    });

    renderShell(null);

    // Resolve como pendente → redirect para /politica.
    expect(await screen.findByTestId('politica-page')).not.toBeNull();
    expect(policyCalls()).toHaveLength(1);
  });

  it('sessão antiga com aceite vigente busca uma vez e não bloqueia', async () => {
    renderShell(null);

    expect(await screen.findByTestId('sidebar-root')).not.toBeNull();
    expect(screen.queryByTestId('politica-page')).toBeNull();
    expect(policyCalls()).toHaveLength(1);
  });

  it('action setPolicyAccepted atualiza o estado (pós-aceite sai do gate)', () => {
    const store = makeStore({ currentVersion: '1.0', accepted: false });
    store.dispatch(setPolicyAccepted({ currentVersion: '1.0', accepted: true }));

    const state = store.getState().auth;
    expect(state.policy).toEqual({ currentVersion: '1.0', accepted: true });
  });

  it('login embute policy no estado (fluxo sem over-fetching)', () => {
    const store = makeStore(null);
    store.dispatch(
      loginAction({
        token: 't2',
        refreshToken: 'r2',
        name: 'Ana',
        email: 'a@b.com',
        role: 'owner',
        tenantId: 't1',
        policy: { currentVersion: '2.0', accepted: false },
      })
    );
    expect(store.getState().auth.policy).toEqual({ currentVersion: '2.0', accepted: false });
  });

  it('logout limpa policy (usuário volta a precisar aceitar no próximo login)', () => {
    localStorage.setItem('fury-policy', JSON.stringify({ currentVersion: '1.0', accepted: true }));
    const store = makeStore({ currentVersion: '1.0', accepted: true });
    store.dispatch(
      loginAction({
        token: 't3',
        refreshToken: 'r3',
        name: 'Ana',
        email: 'a@b.com',
        role: 'owner',
        tenantId: 't1',
        policy: { currentVersion: '1.0', accepted: true },
      })
    );
    expect(store.getState().auth.policy).toEqual({ currentVersion: '1.0', accepted: true });
    expect(localStorage.getItem('fury-policy')).toBe(JSON.stringify({ currentVersion: '1.0', accepted: true }));
  });
});

describe('AuthenticatedShell — onboarding Meta para Trial', () => {
  it('Trial confirmado pela API acessa o dashboard sem conexão Meta', async () => {
    billingState.data = { status: 'trial' };
    billingState.isFetched = true;
    apiGet.mockImplementation((url: string) => {
      if (url === '/meta/connections') return Promise.resolve({ data: { data: [] } });
      if (url === '/policy/current') {
        return Promise.resolve({ data: { data: { currentVersion: '1.0', currentVersionId: 'v1', accepted: true, content: 'texto' } } });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    renderShell({ currentVersion: '1.0', accepted: true }, 'owner', false);

    expect(await screen.findByTestId('sidebar-root')).not.toBeNull();
    expect(screen.queryByTestId('meta-onboarding-page')).toBeNull();
    expect(apiGet.mock.calls.some((call) => call[0] === '/meta/connections')).toBe(false);
  });

  it('flag local de Trial não dispensa o onboarding de uma assinatura ativa', async () => {
    billingState.data = { status: 'active' };
    billingState.isFetched = true;
    localStorage.setItem('fury-public-trial', 'true');
    apiGet.mockImplementation((url: string) => {
      if (url === '/meta/connections') return Promise.resolve({ data: { data: [] } });
      if (url === '/policy/current') {
        return Promise.resolve({ data: { data: { currentVersion: '1.0', currentVersionId: 'v1', accepted: true, content: 'texto' } } });
      }
      return Promise.resolve({ data: { data: [] } });
    });

    renderShell({ currentVersion: '1.0', accepted: true }, 'owner', false);

    expect(await screen.findByTestId('meta-onboarding-page')).not.toBeNull();
  });
});
