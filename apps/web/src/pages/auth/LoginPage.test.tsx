/*
# Language: pt-BR

Funcionalidade: acesso comercial direto à conta demo

  Cenário: visitante abre a demonstração sem preencher credenciais
    Dado que a API de sessão demo está disponível
    Quando clica em "Conhecer o ady com uma conta demo"
    Então a sessão demo é solicitada e o visitante é levado ao Dashboard

  Cenário: indisponibilidade da demo informa uma alternativa
    Dado que a API de sessão demo falha
    Quando clica no acesso demo
    Então vê uma mensagem amigável de indisponibilidade
*/
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';
import { store } from '@/store';

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
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}

describe('BDD: LoginPage conta demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('Cenário: visitante abre a demonstração sem preencher credenciais', async () => {
    mutateAsync.mockResolvedValueOnce({});
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /conhecer o ady com uma conta demo/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');
  });

  it('Cenário: indisponibilidade da demo informa uma alternativa', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('offline'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /conhecer o ady com uma conta demo/i }));

    expect(await screen.findByText(/conta demo está temporariamente indisponível/i)).toBeInTheDocument();
  });
});
