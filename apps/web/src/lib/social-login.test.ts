import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPost = vi.hoisted(() => vi.fn());
const mockDispatch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({ default: { post: mockPost, get: vi.fn() } }));
vi.mock('@/store', () => ({ store: { dispatch: mockDispatch } }));
vi.mock('@/store/slices/authSlice', () => ({ login: (p: unknown) => ({ type: 'auth/login', payload: p }) }));

import { consumeFacebookHandoff, readSocialError, stripSocialParams } from './social-login';

const SESSION = {
  token: 'at',
  refreshToken: 'rt',
  user: { id: 'u1', email: 'a@b.com', name: 'Ana', role: 'owner', tenantId: 't1' },
  isNewUser: false,
};

beforeEach(() => {
  mockPost.mockReset();
  mockDispatch.mockReset();
  localStorage.clear();
});

describe('consumeFacebookHandoff', () => {
  it('retorna null e não chama a API quando não há fb_handoff', async () => {
    const r = await consumeFacebookHandoff('?foo=bar');
    expect(r).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('troca o id pela sessão, persiste e despacha authLogin', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: SESSION } });
    const r = await consumeFacebookHandoff('?fb_handoff=deadbeef');

    expect(mockPost).toHaveBeenCalledWith('/auth/social/handoff', { id: 'deadbeef' });
    expect(r).toEqual(SESSION);
    expect(localStorage.getItem('token')).toBe('at');
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth/login', payload: expect.objectContaining({ token: 'at', tenantId: 't1' }) }),
    );
  });
});

describe('readSocialError', () => {
  it('mapeia oauth_cancelled', () => {
    expect(readSocialError('?error=oauth_cancelled')).toMatch(/cancelad/i);
  });
  it('null quando não há error', () => {
    expect(readSocialError('?x=1')).toBeNull();
  });
});

describe('stripSocialParams', () => {
  const original = window.location;
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: new URL('http://localhost:5173/login?fb_handoff=abc&tab=geral'),
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { writable: true, value: original });
  });

  it('remove fb_handoff/social_login/error preservando o resto', () => {
    const spy = vi.spyOn(window.history, 'replaceState');
    stripSocialParams();
    const newUrl = spy.mock.calls[0][2] as string;
    expect(newUrl).not.toContain('fb_handoff');
    expect(newUrl).toContain('tab=geral');
    spy.mockRestore();
  });
});
