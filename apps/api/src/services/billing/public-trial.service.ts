import crypto from 'node:crypto';
import { z } from 'zod';

const phonePattern = /^(?=(?:\D*\d){7,15}\D*$)[\d\s()+-]{7,20}$/;

export const publicTrialSignupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().regex(phonePattern).optional(),
}).strict();

export type PublicTrialSignup = z.infer<typeof publicTrialSignupSchema>;

export function normalizePublicTrialSignup(input: unknown): PublicTrialSignup {
  return publicTrialSignupSchema.parse(input);
}

/** 256 bits of entropy; only its SHA-256 digest is persisted. */
export function createMagicLinkToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashMagicLinkToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isMagicLinkUsable(input: { token: string; tokenHash: string; expiresAt: Date; consumedAt: Date | null }, now = new Date()): boolean {
  if (input.consumedAt || input.expiresAt.getTime() <= now.getTime()) return false;
  const candidate = hashMagicLinkToken(input.token);
  return candidate.length === input.tokenHash.length
    && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(input.tokenHash));
}

export function signTrialRequest(rawBody: string | Buffer, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function verifyTrialRequestSignature(rawBody: string | Buffer, signature: string, secret: string): boolean {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = signTrialRequest(rawBody, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
