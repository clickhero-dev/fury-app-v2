import crypto from 'node:crypto';
import { z } from 'zod';

export const PUBLIC_TRIAL_PLAN_KEY = 'public_trial_signup' as const;
/** Limites imutáveis do trial adquirido pelo formulário público. */
export const PUBLIC_TRIAL_IMAGE_LIMIT = 5;
/** Links são opacos, de uso único e válidos por uma hora. */
export const MAGIC_LINK_TTL_MS = 60 * 60 * 1000;

const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(20).regex(/^[0-9+()\-\s]+$/).refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }, 'Telefone inválido').optional(),
}).strict();

export type PublicTrialSignup = z.infer<typeof signupSchema>;

export function normalizePublicTrialSignup(input: unknown): PublicTrialSignup {
  const parsed = signupSchema.parse(input);
  return { ...parsed, email: parsed.email.toLowerCase() };
}

export function createMagicLinkToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashMagicLinkToken(raw), expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) };
}

export function hashMagicLinkToken(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Senha provisória nunca é persistida em claro nem retornada pela API. */
export function createTemporaryPassword(): string {
  return crypto.randomBytes(18).toString('base64url');
}

export function verifyWebhookSignature(body: string, header: string | undefined, secret: string): boolean {
  if (!header?.startsWith('sha256=') || !secret) return false;
  const supplied = header.slice('sha256='.length);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
}

export function emailRateLimitKey(email: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(email).digest('hex');
}
