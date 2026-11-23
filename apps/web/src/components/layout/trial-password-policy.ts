import { z } from 'zod';

// O build do frontend usa apps/web como contexto. Mantenha esta política
// alinhada à API; trial-password-policy.test.ts verifica os limites.
export const PASSWORD_RULES = { minLength: 8, maxLength: 255 } as const;
export const passwordSchema = z.string().min(PASSWORD_RULES.minLength).max(PASSWORD_RULES.maxLength)
  .regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/).regex(/[^a-zA-Z0-9]/);
