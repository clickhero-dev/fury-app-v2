/**
 * Funcionalidade: cadastro público de trial
 * Cenários:
 * - Dado URLs distintas de API e frontend, quando monta o link, então aponta para o frontend.
 * - Dado email com espaços e caixa alta, quando normalizado, então retorna email canônico.
 * - Dado payload inválido ou com campo extra, quando validado, então rejeita.
 * - Dado um link válido, quando consumido ou expirado, então deixa de ser utilizável.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  buildPublicTrialAccessUrl,
  createMagicLinkToken,
  hashMagicLinkToken,
  isMagicLinkUsable,
  normalizePublicTrialSignup,
} from '../services/billing/public-trial.service.js';

describe('PublicTrialService', () => {
  it('Dado URLs distintas de API e frontend, quando monta o link, então aponta para o frontend', () => {
    vi.stubEnv('FRONTEND_URL', 'https://web.example/');
    vi.stubEnv('APP_URL', 'https://api.example');
    expect(buildPublicTrialAccessUrl()).toBe('https://web.example/trial/acesso');
  });

  it('Dado email com espaços e caixa alta, quando normalizado, então retorna email canônico', () => {
    expect(normalizePublicTrialSignup({ name: ' Ana ', email: ' ANA@Example.COM ' }))
      .toEqual({ name: 'Ana', email: 'ana@example.com' });
  });

  it('Dado payload inválido ou com campo extra, quando validado, então rejeita', () => {
    expect(() => normalizePublicTrialSignup({ name: '', email: 'invalido' })).toThrow();
    expect(() => normalizePublicTrialSignup({ name: 'Ana', email: 'ana@example.com', role: 'owner' })).toThrow();
  });

  it('Dado um link válido, quando consumido ou expirado, então deixa de ser utilizável', () => {
    const token = createMagicLinkToken();
    const tokenHash = hashMagicLinkToken(token);
    const now = new Date('2026-11-07T12:00:00Z');
    expect(token).toHaveLength(64);
    expect(isMagicLinkUsable({ token, tokenHash, expiresAt: new Date('2026-11-07T12:15:00Z'), consumedAt: null }, now)).toBe(true);
    expect(isMagicLinkUsable({ token, tokenHash, expiresAt: new Date('2026-11-07T12:15:00Z'), consumedAt: now }, now)).toBe(false);
    expect(isMagicLinkUsable({ token, tokenHash, expiresAt: new Date('2026-11-07T11:59:00Z'), consumedAt: null }, now)).toBe(false);
  });
});
