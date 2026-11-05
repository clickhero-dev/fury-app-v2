/*
Funcionalidade: sair limpa tudo da conta no navegador

Cenário: troca de conta no mesmo navegador
  Dado que a conta A deixou token, flag da Meta, copy e job do planejador
  Quando a sessão é limpa
  Então nada disso sobra, o cache de dados some e a store volta ao início
  E preferências que não são da conta (tema) ficam
*/
import { describe, expect, it, vi } from 'vitest';

const mockClear = vi.hoisted(() => vi.fn());
const mockDispatch = vi.hoisted(() => vi.fn());
vi.mock('./query-client', () => ({ queryClient: { clear: mockClear } }));
vi.mock('../store', () => ({ store: { dispatch: mockDispatch } }));

import { clearSession } from './clear-session';

describe('clearSession', () => {
  it('remove dados da conta e mantém o tema', () => {
    for (const k of ['token', 'refreshToken', 'user', 'ady-meta-connected', 'fury-meta-connected', 'fury_selected_copy', 'fury_planner_job_id', 'ady-theme']) {
      localStorage.setItem(k, 'x');
    }
    clearSession();

    expect(Object.keys(localStorage)).toEqual(['ady-theme']);
    expect(mockClear).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/logout' }));
  });
});
