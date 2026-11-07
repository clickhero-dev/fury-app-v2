/*
Funcionalidade: entrar no Trial pelo link seguro
Cenário: o token continua válido no React StrictMode
  Dado que o link contém um token one-time de 64 caracteres
  Quando a página é montada em StrictMode e a pessoa confirma a entrada
  Então a API consome o token uma vez e o Estúdio abre sem exigir Meta
Cenário: token inválido
  Dado que o link contém um token em formato inválido
  Então a entrada permanece desabilitada e a API não é chamada
Cenário: API rejeita o token
  Dado que o link é válido, mas o token foi expirado ou usado
  Quando a pessoa tenta entrar
  Então uma mensagem segura é exibida e o Estúdio não abre
*/
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { post: postMock } }));

import { TrialAccessPage } from './TrialAccessPage';

const token = 'a'.repeat(64);

function renderPage({ strict = false, hash = `#token=${token}` }: { strict?: boolean; hash?: string } = {}) {
  window.history.replaceState({}, '', `/trial/acesso${hash}`);
  const routes = (
    <MemoryRouter initialEntries={['/trial/acesso']}>
      <Routes>
        <Route path="/trial/acesso" element={<TrialAccessPage />} />
        <Route path="/estudio" element={<div data-testid="studio-page" />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{routes}</StrictMode> : routes);
}

beforeEach(() => {
  localStorage.clear();
  postMock.mockReset();
});

describe('TrialAccessPage — link de acesso público', () => {
  it('consome uma única vez o token e abre o Estúdio em StrictMode', async () => {
    postMock.mockResolvedValueOnce({ data: { data: {
      token: 'session-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', name: 'Ana', email: 'ana@example.invalid', role: 'owner', tenantId: 'tenant-1' },
    } } });
    renderPage({ strict: true });

    const button = await screen.findByRole('button', { name: 'Entrar no Ady' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    expect(await screen.findByTestId('studio-page')).toBeInTheDocument();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith('/public/trial/access', { token });
  });

  it('mantém a entrada desabilitada para token em formato inválido', async () => {
    renderPage({ hash: '#token=inválido' });

    expect(await screen.findByRole('button', { name: 'Entrar no Ady' })).toBeDisabled();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('mostra uma mensagem segura se a API rejeitar o token one-time', async () => {
    postMock.mockRejectedValueOnce(new Error('internal token detail'));
    renderPage();

    const button = await screen.findByRole('button', { name: 'Entrar no Ady' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Este link é inválido, já foi usado ou expirou. Solicite um novo acesso.');
    expect(screen.queryByTestId('studio-page')).toBeNull();
  });
});
