/* # language: pt-BR
Funcionalidade: preservar link protegido de onboarding ao exigir login
  Cenário: visitante volta à seleção de conta com query e fragmento
  Cenário: usuário autenticado continua no conteúdo solicitado
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { consumeLoginDestination } from '../pages/auth/initialDestination';

const session = vi.hoisted(() => ({ authenticated: false }));
vi.mock('../store/hooks', () => ({ useAppSelector: () => session.authenticated }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); session.authenticated = false; });
function entry() {
  render(<MemoryRouter initialEntries={['/onboarding/selecionar-conta?connectionId=test#contas']}><Routes>
    <Route path="/onboarding/selecionar-conta" element={<ProtectedRoute><p>Escolher conta</p></ProtectedRoute>} />
    <Route path="/login" element={<p>Autenticar</p>} />
  </Routes></MemoryRouter>);
}
describe('retorno ao onboarding protegido', () => {
  it('preserva destino do visitante', async () => {
    entry(); expect(await screen.findByText('Autenticar')).toBeInTheDocument();
    expect(consumeLoginDestination()).toBe('/onboarding/selecionar-conta?connectionId=test#contas');
  });
  it('mantém conteúdo solicitado após autenticação', () => {
    session.authenticated = true; entry();
    expect(screen.getByText('Escolher conta')).toBeInTheDocument();
  });
});
