import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getConsent,
  setConsent,
  needsConsent,
  serializeCookie,
  CONSENT_COOKIE,
  CONSENT_VERSION,
  type ConsentValue,
} from './cookieConsent';

function clearCookies() {
  for (const part of document.cookie.split('; ')) {
    const k = part.split('=')[0];
    if (k) document.cookie = `${k}=; Max-Age=0; Path=/`;
  }
}

beforeEach(() => {
  vi.restoreAllMocks(); // remove spies antes de tocar document.cookie
  clearCookies();
});

describe('getConsent / needsConsent', () => {
  it('sem cookie: getConsent null, needsConsent true', () => {
    expect(getConsent()).toBeNull();
    expect(needsConsent()).toBe(true);
  });

  it('round-trip dos 3 níveis', () => {
    for (const level of ['all', 'essential', 'rejected'] as const) {
      setConsent(level);
      expect(getConsent()).toMatchObject({ v: CONSENT_VERSION, level });
      expect(needsConsent()).toBe(false);
      clearCookies();
    }
  });

  it('grava at em ISO', () => {
    const v = setConsent('all');
    expect(Number.isNaN(Date.parse(v.at))).toBe(false);
    expect(getConsent()?.at).toBe(v.at);
  });

  it('null para JSON corrompido', () => {
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent('{lixo')}; Path=/`;
    expect(getConsent()).toBeNull();
    expect(needsConsent()).toBe(true);
  });

  it('null para versão anterior', () => {
    const old = { v: '0', level: 'all', at: new Date().toISOString() };
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(old))}; Path=/`;
    expect(getConsent()).toBeNull();
  });

  it('null para level inválido', () => {
    const bad = { v: CONSENT_VERSION, level: 'maybe', at: new Date().toISOString() };
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(bad))}; Path=/`;
    expect(getConsent()).toBeNull();
  });

  it('isola o cookie certo entre outros', () => {
    document.cookie = 'foo=bar; Path=/';
    setConsent('essential');
    document.cookie = 'x=y; Path=/';
    expect(getConsent()?.level).toBe('essential');
  });

  it('não lança quando o getter de document.cookie lança', () => {
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => {
      throw new Error('sandboxed');
    });
    expect(() => getConsent()).not.toThrow();
    expect(getConsent()).toBeNull();
    expect(needsConsent()).toBe(true);
  });
});

describe('setConsent', () => {
  it('grava cookie com Max-Age, Path e SameSite (e sem Secure em http/jsdom)', () => {
    setConsent('all');
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=`);
  });

  it('retorna o valor mesmo se a escrita lançar', () => {
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
      throw new Error('blocked');
    });
    const v = setConsent('rejected');
    expect(v.level).toBe('rejected');
  });
});

describe('serializeCookie', () => {
  const value: ConsentValue = { v: CONSENT_VERSION, level: 'all', at: '2026-09-09T00:00:00.000Z' };

  it('inclui Max-Age de 365 dias, Path e SameSite=Lax', () => {
    const s = serializeCookie(value, false);
    expect(s).toContain('Max-Age=31536000');
    expect(s).toContain('Path=/');
    expect(s).toContain('SameSite=Lax');
  });

  it('adiciona Secure só em contexto https', () => {
    expect(serializeCookie(value, true)).toContain('Secure');
    expect(serializeCookie(value, false)).not.toContain('Secure');
  });
});
