import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import {
  normalizePublicTrialSignup,
  createMagicLinkToken,
  hashMagicLinkToken,
  verifyWebhookSignature,
  MAGIC_LINK_TTL_MS,
  PUBLIC_TRIAL_IMAGE_LIMIT,
} from '../services/core/public-trial-signup.js';

describe('public trial signup', () => {
  it('normaliza nome, email e telefone e rejeita campos extras', () => {
    expect(normalizePublicTrialSignup({
      name: '  Ana Silva  ',
      email: '  ANA@Example.COM ',
      phone: ' +55 (11) 99999-9999 ',
    })).toEqual({ name: 'Ana Silva', email: 'ana@example.com', phone: '+55 (11) 99999-9999' });
    expect(() => normalizePublicTrialSignup({ name: 'Ana', email: 'ana@example.com', password: 'x' })).toThrow();
  });

  it('exige email válido e telefone com faixa de dígitos', () => {
    expect(() => normalizePublicTrialSignup({ name: '', email: 'bad' })).toThrow();
    expect(() => normalizePublicTrialSignup({ name: 'Ana', email: 'ana@example.com', phone: '123' })).toThrow();
  });

  it('gera token aleatório e compara somente hashes', () => {
    const token = createMagicLinkToken();
    expect(token.raw).toHaveLength(64);
    expect(hashMagicLinkToken(token.raw)).toBe(token.hash);
    expect(hashMagicLinkToken(token.raw)).not.toBe(token.raw);
    expect(token.expiresAt.getTime() - Date.now()).toBeGreaterThan(MAGIC_LINK_TTL_MS - 1_000);
    expect(MAGIC_LINK_TTL_MS).toBe(60 * 60 * 1000);
    expect(PUBLIC_TRIAL_IMAGE_LIMIT).toBe(5);
  });

  it('valida assinatura HMAC do corpo bruto', () => {
    const body = '{"email":"ana@example.com"}';
    const signature = crypto.createHmac('sha256', 'secret').update(body).digest('hex');
    expect(verifyWebhookSignature(body, `sha256=${signature}`, 'secret')).toBe(true);
    expect(verifyWebhookSignature(body, 'sha256=invalid', 'secret')).toBe(false);
  });
});
