import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import authReducer, { login } from '../../store/slices/authSlice';
import { PoliticaDeUsoPage } from './PoliticaDeUsoPage';

/*
 * Funcionalidade: usuário Trial não precisa conectar Meta
 * Cenário: após aceitar a política, a pessoa chega à aplicação
 * Dado uma assinatura Trial confirmada pela API, quando aceita a política,
 * então vai ao dashboard sem ser enviada ao onboarding Meta.
 */
const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get: apiGet, post: apiPost } }));
vi.mock('../../hooks/useBilling', () => ({
  useSubscription: () => ({ data: { status: 'trial', plan: { name: 'Trial' } } }),
}));
vi.mock('../../lib/posthog', () => ({ captureEvent: vi.fn() }));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderPage() {
  const store = configureStore({ reducer: { auth: authReducer } });
  store.dispatch(login({
    token: 'token',
    refreshToken: 'refresh',
    name: 'Ana',
    email: 'ana@example.com',
    role: 'owner',
    tenantId: 'tenant-1',
    policy: { currentVersion: '1.0', accepted: false },
  }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/politica']}>
          <LocationProbe />
          <Routes>
            <Route path="/politica" element={<PoliticaDeUsoPage />} />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
            <Route path="/onboarding/conectar-meta" element={<div>Conectar Meta</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}

describe('Política de Uso — conta Trial', () => {
  beforeEach(() => {
    apiGet.mockReset().mockResolvedValue({
      data: { data: { currentVersion: '1.0', currentVersionId: 'policy-1', accepted: false, content: 'Política' } },
    });
    apiPost.mockReset().mockResolvedValue({
      data: { data: { accepted: true, currentVersion: '1.0' } },
    });
    localStorage.clear();
  });

  it('aceita a política e segue ao dashboard sem onboarding Meta', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId('policy-agree-checkbox'));
    await user.click(screen.getByTestId('policy-accept-button'));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(screen.queryByText('Conectar Meta')).not.toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledWith('/policy/accept', { versionId: 'policy-1' });
  });
});
