/*
# Language: pt-BR

Funcionalidade: renovação proativa da sessão

  Cenário: sessão autenticada renova os dois tokens a cada cinco minutos
    Dado uma sessão persistida
    Quando passam cinco minutos
    Então o cliente chama o endpoint de refresh e persiste os tokens rotacionados

  Cenário: refresh inválido encerra a sessão
    Dado uma sessão persistida cujo refresh token foi revogado
    Quando passa o próximo ciclo de renovação
    Então a sessão local é removida
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { post, dispatch, getState, clear } = vi.hoisted(() => ({
  post: vi.fn(),
  dispatch: vi.fn(),
  getState: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('axios', () => ({ default: { post } }));
vi.mock('../store', () => ({ store: { dispatch, getState } }));
vi.mock('../store/slices/authSlice', () => ({
  setTokens: (payload: unknown) => ({ type: 'auth/setTokens', payload }),
  logout: () => ({ type: 'auth/logout' }),
}));
vi.mock('./query-client', () => ({ queryClient: { clear } }));

import { startSessionRefresh, stopSessionRefresh } from './session-refresh.js';

describe('BDD: renovação proativa da sessão', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 'access-antigo');
    localStorage.setItem('refreshToken', 'refresh-antigo');
    getState.mockReturnValue({ auth: { token: 'access-antigo', refreshToken: 'refresh-antigo' } });
    post.mockResolvedValue({
      data: { data: { tokens: { accessToken: 'access-novo', refreshToken: 'refresh-novo' } } },
    });
  });

  afterEach(() => {
    stopSessionRefresh();
    vi.useRealTimers();
  });

  it('Cenário: sessão autenticada renova os dois tokens a cada cinco minutos', async () => {
    startSessionRefresh();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(post).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), {
      refreshToken: 'refresh-antigo',
    });
    expect(localStorage.getItem('token')).toBe('access-novo');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-novo');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'auth/setTokens',
      payload: { token: 'access-novo', refreshToken: 'refresh-novo' },
    });
  });

  it('Cenário: refresh inválido encerra a sessão', async () => {
    post.mockRejectedValueOnce(new Error('refresh revogado'));
    startSessionRefresh();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(clear).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: 'auth/logout' });
  });
});
