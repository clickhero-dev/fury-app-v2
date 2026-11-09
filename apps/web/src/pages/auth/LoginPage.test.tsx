// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';
import { store } from '@/store';

const loginMutateAsync = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useLogin', () => ({
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

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('não oferece acesso direto à conta demo e mantém o formulário de login', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: /demo|demonstração/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^entrar$/i })).not.toBeNull();
    expect(screen.getByLabelText(/e-mail/i)).not.toBeNull();
    expect(screen.getByLabelText(/^senha/i)).not.toBeNull();
  });
});
