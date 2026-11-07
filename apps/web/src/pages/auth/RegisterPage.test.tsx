/*
Funcionalidade: novos cadastros sociais acessam o dashboard
Cenário: retorno do Google para uma conta nova
  Dado que o provedor retorna uma sessão de Trial para novo usuário
  Quando o cadastro social é concluído
  Então o dashboard abre e o shell pode confirmar o Trial pela API
Cenário: retorno do Facebook para uma conta nova
  Dado que o handoff retorna uma sessão de Trial para novo usuário
  Quando o cadastro social é concluído
  Então o dashboard abre e o shell pode confirmar o Trial pela API
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
vi.mock('@/components/auth/GoogleLoginButton', () => ({ GoogleLoginButton: () => null }));
vi.mock('@/components/auth/FacebookLoginButton', () => ({ FacebookLoginButton: () => null }));

import { RegisterPage } from './RegisterPage';

function renderRegisterPage(path: string) {
  window.history.replaceState({}, '', path);
  return render(
    <MemoryRouter initialEntries={['/cadastro']}>
      <Routes>
        <Route path="/cadastro" element={<RegisterPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard" />} />
        <Route path="/onboarding/conectar-meta" element={<div data-testid="meta-onboarding" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  consumeFacebookHandoff.mockReset();
  readSocialError.mockReset().mockReturnValue(null);
  stripSocialParams.mockReset();
});

describe('RegisterPage — cadastro social Trial', () => {
  it('retorno do Google para usuário novo abre o dashboard', async () => {
    const session = {
      token: 'google-token',
      refreshToken: 'google-refresh',
      user: { name: 'Ana', email: 'ana@example.invalid', role: 'user', tenantId: 'tenant-1' },
      policy: { currentVersion: '1.0', accepted: true },
      isNewUser: true,
    };
    const socialLogin = encodeURIComponent(JSON.stringify(session));

    renderRegisterPage(`/cadastro?social_login=${socialLogin}`);

    expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('meta-onboarding')).toBeNull();
  });

  it('handoff do Facebook para usuário novo abre o dashboard', async () => {
    consumeFacebookHandoff.mockResolvedValueOnce({ isNewUser: true });

    renderRegisterPage('/cadastro');

    expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('meta-onboarding')).toBeNull();
    expect(consumeFacebookHandoff).toHaveBeenCalledWith('');
  });
});
