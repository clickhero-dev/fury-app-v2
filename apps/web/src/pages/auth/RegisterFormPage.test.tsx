/*
Funcionalidade: concluir o cadastro manual Trial sem conectar a Meta
Cenário: verificação de email bem-sucedida
  Dado que o cadastro foi criado e o OTP é válido
  Quando o usuário verifica o email
  Então a sessão é salva e o dashboard abre sem onboarding Meta
Cenário: OTP inválido
  Dado que o cadastro foi criado
  Quando o usuário informa um OTP inválido
  Então o erro é exibido e a sessão não avança ao dashboard
*/
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registerMock, verifyMock, resendMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  verifyMock: vi.fn(),
  resendMock: vi.fn(),
}));

vi.mock('@/hooks/useRegister', () => ({ useRegister: () => ({ mutateAsync: registerMock, isPending: false }) }));
vi.mock('@/hooks/useVerifyEmail', () => ({ useVerifyEmail: () => ({ mutateAsync: verifyMock, isPending: false }) }));
vi.mock('@/hooks/useResendOtp', () => ({ useResendOtp: () => ({ mutateAsync: resendMock, isPending: false }) }));

import { RegisterFormPage } from './RegisterFormPage';

function renderRegistration() {
  return render(
    <MemoryRouter initialEntries={['/cadastro/formulario']}>
      <Routes>
        <Route path="/cadastro/formulario" element={<RegisterFormPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard" />} />
        <Route path="/onboarding/conectar-meta" element={<div data-testid="meta-onboarding" />} />
      </Routes>
    </MemoryRouter>
  );
}

async function submitRegistration() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Nome Completo'), 'Diogo Teste');
  await user.type(screen.getByLabelText('E-mail'), 'trial@example.invalid');
  await user.type(screen.getByLabelText('Senha'), 'Fury1234!');
  await user.type(screen.getByLabelText('Empresa'), 'Empresa Teste');
  await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
  await screen.findByText('Código de verificação');
  return user;
}

beforeEach(() => {
  localStorage.clear();
  registerMock.mockReset().mockResolvedValue({ user: { id: 'user-1' } });
  verifyMock.mockReset().mockResolvedValue({
    token: 'test-token',
    refreshToken: 'test-refresh',
    user: { id: 'user-1', name: 'Diogo Teste', email: 'trial@example.invalid', role: 'user', tenantId: 'tenant-1' },
  });
  resendMock.mockReset().mockResolvedValue(undefined);
});

describe('RegisterFormPage — cadastro manual Trial', () => {
  it('verifica email, salva a sessão e abre o dashboard sem Meta', async () => {
    renderRegistration();
    await submitRegistration();

    fireEvent.paste(screen.getByLabelText('Dígito 1 do código OTP'), {
      clipboardData: { getData: () => '123456' },
    });

    expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('meta-onboarding')).toBeNull();
    expect(localStorage.getItem('token')).toBe('test-token');
    expect(verifyMock).toHaveBeenCalledWith({ userId: 'user-1', code: '123456' });
  });

  it('mantém a verificação aberta e exibe erro se o OTP for inválido', async () => {
    verifyMock.mockRejectedValueOnce(new Error('Código inválido'));
    renderRegistration();
    await submitRegistration();

    fireEvent.paste(screen.getByLabelText('Dígito 1 do código OTP'), {
      clipboardData: { getData: () => '000000' },
    });

    expect(await screen.findByText('Código inválido')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });
});
