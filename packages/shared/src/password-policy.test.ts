import { describe, it, expect } from 'vitest';
import { isStrongPassword, passwordSchema } from './password-policy.js';

describe('password-policy (forte: 8+ maiúscula, minúscula, número, especial)', () => {
  it('aceita senha forte', () => {
    expect(isStrongPassword('SenhaForte1!')).toBe(true);
    expect(passwordSchema.safeParse('SenhaForte1!').success).toBe(true);
  });

  it('rejeita senha curta (< 8)', () => {
    expect(isStrongPassword('Se1!')).toBe(false);
    expect(passwordSchema.safeParse('Se1!').success).toBe(false);
  });

  it('rejeita sem minúscula', () => {
    expect(isStrongPassword('SENHA123!')).toBe(false);
    expect(passwordSchema.safeParse('SENHA123!').success).toBe(false);
  });

  it('rejeita sem maiúscula', () => {
    expect(isStrongPassword('senha123!')).toBe(false);
    expect(passwordSchema.safeParse('senha123!').success).toBe(false);
  });

  it('rejeita sem número', () => {
    expect(isStrongPassword('SenhaForte!')).toBe(false);
    expect(passwordSchema.safeParse('SenhaForte!').success).toBe(false);
  });

  it('rejeita sem caractere especial', () => {
    expect(isStrongPassword('SenhaForte1')).toBe(false);
    expect(passwordSchema.safeParse('SenhaForte1').success).toBe(false);
  });

  it('rejeita vazio', () => {
    expect(isStrongPassword('')).toBe(false);
    expect(passwordSchema.safeParse('').success).toBe(false);
  });
});