import { getRedis } from './redis.js';
import { AppError } from '../middleware/errorHandler.js';

const WINDOW_SECONDS = 15 * 60;

export async function checkEmailRateLimit(
  scope: 'verify_email' | 'forgot_password',
  email: string,
  max: number,
): Promise<boolean> {
  const redis = getRedis();
  const key = `email_rate_limit:${scope}:${email.toLowerCase()}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  return count <= max;
}

export async function assertEmailRateLimit(
  scope: 'verify_email' | 'forgot_password',
  email: string,
  max: number,
): Promise<void> {
  const allowed = await checkEmailRateLimit(scope, email, max);
  if (!allowed) {
    throw new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Too many attempts. Please try again in 15 minutes.');
  }
}
