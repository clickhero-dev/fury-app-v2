import { z } from 'zod';

/**
 * Política de senha forte — compartilhada entre API e Web.
 * Regras: mínimo 8 caracteres, ao menos 1 maiúscula, 1 minúscula,
 * 1 número e 1 caractere especial.
 */
export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 255,
} as const;

export function isStrongPassword(password: string): boolean {
  if (!password || password.length < PASSWORD_RULES.minLength) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[^a-zA-Z0-9]/.test(password)) return false;
  return true;
}

export const passwordSchema = z
  .string()
  .min(PASSWORD_RULES.minLength, 'A senha deve ter pelo menos 8 caracteres.')
  .max(PASSWORD_RULES.maxLength)
  .regex(/[a-z]/, 'A senha deve conter uma letra minúscula.')
  .regex(/[A-Z]/, 'A senha deve conter uma letra maiúscula.')
  .regex(/\d/, 'A senha deve conter um número.')
  .regex(/[^a-zA-Z0-9]/, 'A senha deve conter um caractere especial.');