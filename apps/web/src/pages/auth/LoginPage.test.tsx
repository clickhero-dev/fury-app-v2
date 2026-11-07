/*
Funcionalidade: novo usuário social conclui o login sem Meta
Cenário: Facebook retorna uma conta nova com Trial
  Dado que o handoff confirma uma sessão nova
  Quando o login social termina
  Então o dashboard abre e o shell valida a assinatura pela API
*/
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { consumeFacebookHandoff, readSocialError, stripSocialParams } = vi.hoisted(() => ({
  consumeFacebookHandoff: vi.fn(),
  readSocialError: vi.fn(() => null),
  stripSocialParams: vi.fn(),
}));

vi.mock('@/lib/social-login', () => ({ consumeFacebookHandoff, readSocialError, stripSocialParams }));
vi.mock('@/hooks/useLogin', () => ({ useLogin: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('@/components/auth/GoogleLoginButton', () => ({ GoogleLoginButton: () => null }));
vi.mock('@/components/auth/FacebookLoginButton', () => ({ FacebookLoginButton: () => null }));

import { LoginPage } from './LoginPage';

beforeEach(() => {
  localStorage.clear();
  consumeFacebookHandoff.mockReset().mockResolvedValueOnce({ isNewUser: true });
  readSocialError.mockReset().mockReturnValue(null);
  stripSocialParams.mockReset();
});

describe('LoginPage — retorno social de usuário novo', () => {
  it('Facebook novo abre dashboard para verificar o Trial pela API', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div data-testid="dashboard" />} />
          <Route path="/onboarding/conectar-meta" element={<div data-testid="meta-onboarding" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('meta-onboarding')).toBeNull();
  });
});
