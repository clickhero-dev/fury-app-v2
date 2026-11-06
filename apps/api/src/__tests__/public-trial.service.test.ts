/**
 * Funcionalidade: cadastro público de trial
 * Cenários: normalização, assinatura e link de uso único não vazam identidade.
 */
import { describe, expect, it } from 'vitest';
import { createMagicLinkToken, hashMagicLinkToken, isMagicLinkUsable, normalizePublicTrialSignup, signTrialRequest, verifyTrialRequestSignature } from '../services/billing/public-trial.service.js';

describe('PublicTrialService', () => {
  it('Dado um email com caixa e espaços, quando normalizado, então cria chave canônica', () => {
    expect(normalizePublicTrialSignup({ name: ' Ana ', email: ' ANA@Example.COM ', phone: ' +55 (11) 99999-0000 ' }))
      .toEqual({ name: 'Ana', email: 'ana@example.com', phone: '+55 (11) 99999-0000' });
  });

  it('Dado payload inválido, quando normalizado, então rejeita sem aceitar campos extras', () => {
    expect(() => normalizePublicTrialSignup({ name: '', email: 'invalido' })).toThrow();
    expect(() => normalizePublicTrialSignup({ name: 'Ana', email: 'ana@example.com', role: 'owner' })).toThrow();
  });

  it('Dado um webhook assinado, quando o corpo muda, então a assinatura é rejeitada', () => {
    const body = JSON.stringify({ name: 'Ana', email: 'ana@example.com' });
    const signature = signTrialRequest(body, 'secret');
    expect(verifyTrialRequestSignature(body, signature, 'secret')).toBe(true);
    expect(verifyTrialRequestSignature(`${body} `, signature, 'secret')).toBe(false);
  });

  it('Dado link válido, quando consumido ou expirado, então não permanece utilizável', () => {
    const token = createMagicLinkToken();
    const hash = hashMagicLinkToken(token);
    const now = new Date('2026-11-06T12:00:00Z');
    expect(isMagicLinkUsable({ token, tokenHash: hash, expiresAt: new Date('2026-11-06T12:15:00Z'), consumedAt: null }, now)).toBe(true);
    expect(isMagicLinkUsable({ token, tokenHash: hash, expiresAt: new Date('2026-11-06T12:15:00Z'), consumedAt: now }, now)).toBe(false);
    expect(isMagicLinkUsable({ token, tokenHash: hash, expiresAt: new Date('2026-11-06T11:59:00Z'), consumedAt: null }, now)).toBe(false);
  });
});
