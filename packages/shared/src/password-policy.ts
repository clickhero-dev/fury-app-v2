import { z } from 'zod';

// Política de senha (API e Web): só mínimo de 8 caracteres
export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 255,
} as const;

export function isStrongPassword(password: string): boolean {
  return !!password && password.length >= PASSWORD_RULES.minLength && password.length <= PASSWORD_RULES.maxLength;
}

export const passwordSchema = z
  .string()
  .min(PASSWORD_RULES.minLength, 'A senha deve ter pelo menos 8 caracteres.')
  .max(PASSWORD_RULES.maxLength);