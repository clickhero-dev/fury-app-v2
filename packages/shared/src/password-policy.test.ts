import { describe, it, expect } from 'vitest';
import { isStrongPassword, passwordSchema } from './password-policy.js';

describe('password-policy (só mínimo de 8 caracteres)', () => {
  it('aceita qualquer senha com 8+ caracteres', () => {
    for (const p of ['abcdefgh', '12345678', 'SenhaForte1!']) {
      expect(isStrongPassword(p)).toBe(true);
      expect(passwordSchema.safeParse(p).success).toBe(true);
    }
  });

  it('rejeita senha curta (< 8)', () => {
    expect(isStrongPassword('abcdefg')).toBe(false);
    expect(passwordSchema.safeParse('abcdefg').success).toBe(false);
  });

  it('rejeita vazio e acima de 255', () => {
    expect(isStrongPassword('')).toBe(false);
    expect(passwordSchema.safeParse('').success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(256)).success).toBe(false);
  });
});
