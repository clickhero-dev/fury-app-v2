import { Router } from 'express';
import { controllers } from '../di.js';
import crypto from 'node:crypto';
import { getRedis } from '../lib/redis.js';
import { AppError } from '../middleware/errorHandler.js';
import { getClientIp } from '../middleware/rate-limit.middleware.js';

const router = Router();
export function isTrialOriginAllowed(origin: string | undefined, configured: string | undefined = process.env.TRIAL_WEBHOOK_ORIGINS): boolean {
  if (!origin || !configured?.trim()) return true;
  const allowed = configured.split(',').map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin);
}

async function publicTrialAbuseGuard(req: any, _res: any, next: any) {
  if (process.env.NODE_ENV === 'test') return next();
  if (Number(req.headers['content-length'] || 0) > 4096) return next(new AppError(413, 'PAYLOAD_TOO_LARGE', 'Requisição muito grande.'));
  if (!isTrialOriginAllowed(req.header('origin'))) return next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origem não autorizada.'));
  try {
    const redis = getRedis();
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const secret = process.env.TRIAL_RATE_LIMIT_SECRET || process.env.JWT_SECRET || 'trial-rate-limit';
    const emailKey = email ? crypto.createHmac('sha256', secret).update(email).digest('hex') : 'missing';
    const keys = [`public-trial:ip:${getClientIp(req)}`, `public-trial:email:${emailKey}`];
    const counts = await Promise.all(keys.map(async (key) => {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, key.includes(':ip:') ? 15 * 60 : 60 * 60);
      return count;
    }));
    if (counts[0] > 10 || counts[1] > 3) {
      req.res.set('Retry-After', '900');
      return next(new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Muitas solicitações.'));
    }
    return next();
  } catch {
    return next(new AppError(503, 'RATE_LIMIT_UNAVAILABLE', 'Serviço temporariamente indisponível.'));
  }
}
router.post('/trial/signup', publicTrialAbuseGuard, controllers.publicTrial.signup);
router.post('/trial/access', controllers.publicTrial.access);
export default router;
