import { describe, expect, it } from 'vitest';
import { passwordSchema as apiPasswordSchema } from '../../../../../packages/shared/src/password-policy';
import { passwordSchema } from './trial-password-policy';

describe('política de senha no frontend', () => {
  it.each(['', 'abcdefg', 'abcdefgh', 'Senha1!', 'Senha123!', 'senhaforte1!', 'SENHAFORTE1!', 'SenhaForte!', 'SenhaForte1', 'Aa1!' + 'a'.repeat(251), 'a'.repeat(255), 'a'.repeat(256)])('mantém paridade com a API para %j', (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(apiPasswordSchema.safeParse(password).success);
  });
});
