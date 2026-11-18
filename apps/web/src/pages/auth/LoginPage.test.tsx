/*
# Language: pt-BR

Funcionalidade: acesso comercial direto à conta demo

  Cenário: visitante abre a demonstração sem preencher credenciais
    Dado que a API de sessão demo está disponível
    Quando clica em "Conhecer o ady com uma conta demo"
    Então a sessão demo é solicitada e o visitante é levado à Home

  Cenário: indisponibilidade da demo informa uma alternativa
    Dado que a API de sessão demo falha
    Quando clica no acesso demo
    Então vê uma mensagem amigável de indisponibilidade
*/
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';
import { store } from '@/store';
import { rememberLoginDestination } from './initialDestination';

const mutateAsync = vi.hoisted(() => vi.fn());
const loginMutateAsync = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useLogin', () => ({
  useDemoLogin: () => ({ mutateAsync, isPending: false }),
  useLogin: () => ({ mutateAsync: loginMutateAsync, isPending: false }),
}));
vi.mock('@/components/auth/GoogleLoginButton', () => ({ GoogleLoginButton: () => null }));
vi.mock('@/components/auth/FacebookLoginButton', () => ({ FacebookLoginButton: () => null }));
vi.mock('@/components/AdySymbol', () => ({ AdySymbol: () => <span aria-hidden="true" /> }));
vi.mock('@/lib/social-login', () => ({
  consumeFacebookHandoff: vi.fn().mockResolvedValue(null),
  readSocialError: vi.fn().mockReturnValue(null),
  stripSocialParams: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search + location.hash}</output>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode><Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider></StrictMode>,
  );
}

describe('BDD: LoginPage conta demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/login');
  });

  it('Cenário: visitante abre a demonstração sem preencher credenciais', async () => {
    mutateAsync.mockResolvedValueOnce({});
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /conhecer o ady com uma conta demo/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/inicio'));
  });

  it('Cenário: indisponibilidade da demo informa uma alternativa', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('offline'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /conhecer o ady com uma conta demo/i }));

    expect(await screen.findByText(/conta demo está temporariamente indisponível/i)).toBeInTheDocument();
  });

  it('Cenário: sessão autenticada conserva deep link mesmo em StrictMode', async () => {
    localStorage.setItem('token', 'session');
    rememberLoginDestination('/estudio/imagem?origem=convite#criar');
    renderPage();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/estudio/imagem?origem=convite#criar'));
  });

  it('Cenário: retorno Google conserva deep link mesmo em StrictMode', async () => {
    rememberLoginDestination('/calendario?view=week#hoje');
    const session = { token: 'session', refreshToken: 'refresh', user: { name: 'Teste', email: 'test@example.invalid', role: 'owner', tenantId: 'test' } };
    window.history.replaceState({}, '', `/login?social_login=${encodeURIComponent(JSON.stringify(session))}`);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/calendario?view=week#hoje'));
  });
});
// @vitest-environment jsdom

import '../../test/setup';

