/*
# Language: pt-BR

Funcionalidade: renovação proativa da sessão

  Cenário: sessão autenticada renova o acesso a cada cinco minutos
    Dado uma sessão persistida
    Quando passam cinco minutos
    Então o cliente chama o endpoint de refresh e persiste os tokens retornados

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

import { refreshSession, startSessionRefresh, stopSessionRefresh } from './session-refresh.js';

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

  it('Cenário: sessão autenticada renova o acesso a cada cinco minutos', async () => {
    startSessionRefresh();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      { refreshToken: 'refresh-antigo' },
      { timeout: 15_000 },
    );
    expect(localStorage.getItem('token')).toBe('access-novo');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-novo');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'auth/setTokens',
      payload: { token: 'access-novo', refreshToken: 'refresh-novo' },
    });
  });

  it('preserva a sessão quando a renovação falha por rede', async () => {
    post.mockRejectedValueOnce(new Error('rede indisponível'));
    startSessionRefresh();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(localStorage.getItem('token')).toBe('access-antigo');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-antigo');
    expect(clear).not.toHaveBeenCalled();
  });

  it.each(['INVALID_REFRESH_TOKEN', 'REFRESH_TOKEN_EXPIRED', 'USER_NOT_FOUND'])('refresh rejeitado com %s encerra a sessão', async (code) => {
    post.mockRejectedValueOnce({ response: { status: 401, data: { error: { code } } } });
    startSessionRefresh();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(clear).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: 'auth/logout' });
  });

  it.each([
    new Error('sem rede'),
    { response: { status: 500 } },
    { response: { status: 429 } },
    { response: { status: 401, data: { error: { code: 'OTHER_ERROR' } } } },
  ])('preserva a sessão diante de erro temporário %#', async (error) => {
    post.mockRejectedValueOnce(error);
    startSessionRefresh();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(localStorage.getItem('token')).toBe('access-antigo');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-antigo');
    expect(clear).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(localStorage.getItem('token')).toBe('access-novo');
  });

  it('não apaga nem sobrescreve uma nova sessão quando o refresh anterior falha', async () => {
    let reject!: (error: unknown) => void;
    post.mockReturnValueOnce(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const pending = refreshSession();
    localStorage.setItem('token', 'outro-acesso');
    localStorage.setItem('refreshToken', 'outra-sessao');
    reject({ response: { status: 401, data: { error: { code: 'INVALID_REFRESH_TOKEN' } } } });
    await expect(pending).rejects.toBeDefined();
    expect(localStorage.getItem('token')).toBe('outro-acesso');
    expect(localStorage.getItem('refreshToken')).toBe('outra-sessao');
    expect(clear).not.toHaveBeenCalled();
  });

  it('propaga logout feito em outra aba', () => {
    startSessionRefresh();
    localStorage.removeItem('refreshToken');
    window.dispatchEvent(new StorageEvent('storage', { key: 'refreshToken', newValue: null }));
    expect(localStorage.getItem('token')).toBeNull();
    expect(dispatch).toHaveBeenCalledWith({ type: 'auth/logout' });
  });

  it('ignora evento antigo de logout após novo login em outra aba', () => {
    startSessionRefresh();
    localStorage.setItem('refreshToken', 'sessao-nova');
    window.dispatchEvent(new StorageEvent('storage', { key: 'refreshToken', newValue: null }));
    expect(localStorage.getItem('refreshToken')).toBe('sessao-nova');
    expect(clear).not.toHaveBeenCalled();
  });
});
