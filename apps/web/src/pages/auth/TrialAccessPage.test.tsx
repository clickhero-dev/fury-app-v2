/*
 * Funcionalidade: acesso público ao Trial
 * Cenários:
 * - Dado link válido, quando confirma o acesso, então consome o token uma vez e só salva sessão após sucesso da API.
 * - Dado link ausente ou inválido, quando abre a página, então não chama a API e oferece solicitar outro.
 * - Dado link rejeitado, quando tenta acessar, então mantém a sessão atual e oferece solicitar outro.
 * - Dado token enviado e rejeitado, quando a API responde, então o token não pode ser reenviado pela mesma tela.
 */
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { post: postMock } }));
import { TrialAccessPage } from './TrialAccessPage';
const token = 'a'.repeat(64);
function renderPage(hash = `#token=${token}`) {
  window.history.replaceState({}, '', `/trial/acesso${hash}`);
  return render(<StrictMode><MemoryRouter initialEntries={['/trial/acesso']}><Routes>
    <Route path="/trial/acesso" element={<TrialAccessPage />} /><Route path="/estudio" element={<p>Estúdio</p>} />
  </Routes></MemoryRouter></StrictMode>);
}
beforeEach(() => { localStorage.clear(); postMock.mockReset(); });
describe('TrialAccessPage', () => {
  it('consome uma vez em StrictMode e salva sessão somente após sucesso', async () => {
    postMock.mockResolvedValueOnce({ data: { data: { token: 'accepted', refreshToken: 'refresh', user: { name: 'Ana', email: 'ana@test.invalid', role: 'owner', tenantId: 't1' } } } });
    renderPage();
    const button = await screen.findByRole('button', { name: /entrar/i });
    await waitFor(() => expect(button).toBeEnabled());
    expect(localStorage.getItem('token')).toBeNull();
    fireEvent.click(button);
    expect(await screen.findByText('Estúdio')).toBeInTheDocument();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith('/public/trial/access', { token });
    expect(localStorage.getItem('token')).toBe('accepted');
  });
  it('não chama API para token ausente ou inválido', async () => {
    renderPage('#other=value');
    expect(await screen.findByRole('button', { name: /entrar/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/inválido/i);
    expect(screen.getByRole('link', { name: /solicitar novo acesso/i })).toHaveAttribute('href', '/trial/solicitar');
    expect(postMock).not.toHaveBeenCalled();
  });
  it('não altera sessão, mostra erro e limpa token se API rejeitar acesso', async () => {
    localStorage.setItem('token', 'existing');
    postMock.mockRejectedValueOnce(new Error('secret details'));
    renderPage();
    const button = await screen.findByRole('button', { name: /entrar/i });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /solicitar novo acesso/i })).toHaveAttribute('href', '/trial/solicitar');
    expect(localStorage.getItem('token')).toBe('existing');
    expect(screen.queryByText('Estúdio')).toBeNull();
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(postMock).toHaveBeenCalledTimes(1);
  });
});
