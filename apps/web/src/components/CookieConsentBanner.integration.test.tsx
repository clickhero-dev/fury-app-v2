import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CookieConsentBanner } from './CookieConsentBanner';
import { getConsent, CONSENT_COOKIE } from '../lib/cookieConsent';

function clearCookies() {
  for (const part of document.cookie.split('; ')) {
    const k = part.split('=')[0];
    if (k) document.cookie = `${k}=; Max-Age=0; Path=/`;
  }
}

beforeEach(() => {
  clearCookies();
  cleanup();
});

describe('CookieConsentBanner (integração, cookie real)', () => {
  it.each(['all', 'essential', 'rejected'] as const)(
    'escolher "%s" persiste no cookie e não repete o banner',
    async (level) => {
      const label = { all: 'Aceitar todos', essential: 'Somente essenciais', rejected: 'Recusar' }[level];
      const { unmount } = render(<CookieConsentBanner />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: label }));
      expect(document.cookie).toContain(`${CONSENT_COOKIE}=`);
      expect(getConsent()?.level).toBe(level);

      unmount();
      render(<CookieConsentBanner />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );

  it('cookie de versão anterior faz o banner reaparecer', () => {
    const old = { v: '0', level: 'all', at: new Date().toISOString() };
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(old))}; Path=/`;
    render(<CookieConsentBanner />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('cookie corrompido faz o banner reaparecer sem erro', () => {
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent('{lixo')}; Path=/`;
    render(<CookieConsentBanner />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
