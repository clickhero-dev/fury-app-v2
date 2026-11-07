import crypto from 'node:crypto';
import { z } from 'zod';

const phonePattern = /^(?=(?:\D*\d){7,15}\D*$)[\d\s()+-]{7,20}$/;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const DEFAULT_FRONTEND_URL = 'https://clickhero-fury-web.u7pe19.easypanel.host';

export function buildPublicTrialAccessUrl(frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL): string {
  return `${frontendUrl.trim().replace(/\/+$/, '')}/trial/acesso`;
}

export const publicTrialSignupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().regex(phonePattern).optional(),
}).strict();

export type PublicTrialSignup = z.infer<typeof publicTrialSignupSchema>;

export function normalizePublicTrialSignup(input: unknown): PublicTrialSignup {
  return publicTrialSignupSchema.parse(input);
}

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

export const PUBLIC_TRIAL_MAGIC_LINK_TTL_MS = MAGIC_LINK_TTL_MS;
