import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CookieConsentBanner } from './CookieConsentBanner';
import { PRIVACY_URL } from '../lib/cookieConsent';

const consent = vi.hoisted(() => ({ needsConsent: vi.fn(), setConsent: vi.fn() }));

vi.mock('../lib/cookieConsent', async (orig) => ({
  ...(await orig<typeof import('../lib/cookieConsent')>()),
  needsConsent: consent.needsConsent,
  setConsent: consent.setConsent,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CookieConsentBanner', () => {
  it('aparece quando needsConsent é true', () => {
    consent.needsConsent.mockReturnValue(true);
    render(<CookieConsentBanner />);
    expect(screen.getByRole('dialog', { name: /consentimento de cookies/i })).toBeInTheDocument();
  });

  it('não aparece quando needsConsent é false', () => {
    consent.needsConsent.mockReturnValue(false);
    render(<CookieConsentBanner />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tem exatamente 3 botões e nenhum de fechar', () => {
    consent.needsConsent.mockReturnValue(true);
    render(<CookieConsentBanner />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Somente essenciais' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceitar todos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fechar|×|x|depois/i })).not.toBeInTheDocument();
  });

  it('os 3 botões têm o mesmo peso visual (tamanho/tipografia)', () => {
    consent.needsConsent.mockReturnValue(true);
    render(<CookieConsentBanner />);
    for (const name of ['Recusar', 'Somente essenciais', 'Aceitar todos']) {
      const btn = screen.getByRole('button', { name });
      for (const cls of ['px-4', 'py-2', 'text-xs', 'font-semibold', 'rounded-full']) {
        expect(btn.className).toContain(cls);
      }
    }
  });

  it('link da política abre em nova aba com rel noopener', () => {
    consent.needsConsent.mockReturnValue(true);
    render(<CookieConsentBanner />);
    const link = screen.getByRole('link', { name: /política de privacidade/i });
    expect(link).toHaveAttribute('href', PRIVACY_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it.each([
    ['Aceitar todos', 'all'],
    ['Somente essenciais', 'essential'],
    ['Recusar', 'rejected'],
  ] as const)('clicar "%s" grava %s e some', async (label, level) => {
    consent.needsConsent.mockReturnValue(true);
    render(<CookieConsentBanner />);
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(consent.setConsent).toHaveBeenCalledWith(level);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
