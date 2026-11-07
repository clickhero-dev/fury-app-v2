import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { getRedis } from '../lib/redis.js';
import { PublicTrialFlowService } from '../services/billing/public-trial-flow.service.js';
import { normalizePublicTrialSignup } from '../services/billing/public-trial.service.js';

const accessSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();
const noStoreHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const checkAndIncrementRateLimitsScript = `
local primaryLimit = tonumber(ARGV[1])
local subjectLimit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local primaryCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local subjectCount = tonumber(redis.call('GET', KEYS[2]) or '0')
if primaryCount >= primaryLimit or subjectCount >= subjectLimit then return 0 end
primaryCount = redis.call('INCR', KEYS[1])
if primaryCount == 1 then redis.call('EXPIRE', KEYS[1], ttl) end
subjectCount = redis.call('INCR', KEYS[2])
if subjectCount == 1 then redis.call('EXPIRE', KEYS[2], ttl) end
return 1
`;

/** Controller público de aquisição; sem tenant até o cadastro ser resolvido. */
export class PublicTrialController {
  constructor(private readonly service: PublicTrialFlowService) {}

  signup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.set(noStoreHeaders);
      this.assertAllowedOrigin(req.header('origin'));
      const rawBody = JSON.stringify(req.body ?? {});
      if (Buffer.byteLength(rawBody, 'utf8') > 4096) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Requisição inválida.');
      const signup = normalizePublicTrialSignup(req.body);
      await this.checkRateLimit('signup', req.ip || 'unknown', signup.email);
      const result = await this.service.signup(signup);
      res.status(202).json({ success: true, data: result, timestamp: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  };

  access = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.set(noStoreHeaders);
      this.assertAllowedOrigin(req.header('origin'));
      const { token } = accessSchema.parse(req.body);
      await this.checkRateLimit('access', req.ip || 'unknown', token);
      const result = await this.service.access(token);
      res.status(200).json({
        success: true,
        data: { token: result.tokens.accessToken, refreshToken: result.tokens.refreshToken, user: result.user },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  private assertAllowedOrigin(origin?: string): void {
    const configuredOrigins = process.env.PUBLIC_TRIAL_ALLOWED_ORIGINS || process.env.FRONTEND_URL || '';
    const allowedOrigins = configuredOrigins.split(',').map((value) => {
      const trimmed = value.trim();
      if (!trimmed) return '';
      try { return new URL(trimmed).origin; } catch { return ''; }
    }).filter(Boolean);
    if (!origin || !allowedOrigins.includes(origin)) {
      throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Requisição não autorizada.');
    }
  }

  private async checkRateLimit(scope: 'signup' | 'access', ip: string, subject: string): Promise<void> {
    const secret = process.env.PUBLIC_TRIAL_RATE_KEY || process.env.JWT_SECRET;
    if (!secret) throw new AppError(503, 'TRIAL_RATE_LIMIT_UNAVAILABLE', 'Serviço temporariamente indisponível.');
    try {
      const hash = (value: string) => crypto.createHmac('sha256', secret).update(value).digest('hex');
      const redis = getRedis();
      const isAccess = scope === 'access';
      const ipPrefix = isAccess ? 'public-trial:access:ip' : 'public-trial:ip';
      const subjectPrefix = isAccess ? 'public-trial:access:token' : 'public-trial:email';
      const [ipLimit, subjectLimit] = isAccess ? [60, 5] : [10, 1];
      const allowed = Number(await redis.eval(
        checkAndIncrementRateLimitsScript,
        2,
        `${ipPrefix}:${hash(ip)}`,
        `${subjectPrefix}:${hash(subject)}`,
        ipLimit,
        subjectLimit,
        900,
      ));
      if (allowed !== 1) throw new AppError(429, 'TRIAL_RATE_LIMITED', 'Tente novamente mais tarde.');
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'TRIAL_RATE_LIMIT_UNAVAILABLE', 'Serviço temporariamente indisponível.');
    }
  }
}
