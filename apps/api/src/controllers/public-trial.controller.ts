import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { getRedis } from '../lib/redis.js';
import { normalizePublicTrialSignup, verifyTrialRequestSignature } from '../services/billing/public-trial.service.js';
import { PublicTrialFlowService } from '../services/billing/public-trial-flow.service.js';

const accessSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();
const noStore = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export class PublicTrialController {
  constructor(private readonly service: PublicTrialFlowService) {}

  signup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.set(noStore);
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
      if (raw.byteLength > 4096) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Requisição inválida.');
      const secret = process.env.PUBLIC_TRIAL_WEBHOOK_SECRET;
      if (secret && !verifyTrialRequestSignature(raw, String(req.header('x-trial-signature') ?? ''), secret)) {
        throw new AppError(401, 'INVALID_SIGNATURE', 'Requisição não autorizada.');
      }
      const origin = req.header('origin');
      const allowed = process.env.PUBLIC_TRIAL_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
      if (origin && allowed.length && !allowed.includes(origin)) throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Requisição não autorizada.');
      let body: unknown;
      try { body = Buffer.isBuffer(req.body) ? JSON.parse(raw.toString('utf8')) : req.body; } catch { throw new AppError(400, 'INVALID_JSON', 'Requisição inválida.'); }
      const signup = normalizePublicTrialSignup(body);
      await this.checkRateLimit(req.ip || 'unknown', signup.email);
      const result = await this.service.signup(signup);
      res.status(202).json({ success: true, data: result, timestamp: new Date().toISOString() });
    } catch (error) { next(error); }
  };

  access = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.set(noStore);
      const { token } = accessSchema.parse(req.body);
      const result = await this.service.access(token);
      res.status(200).json({ success: true, data: { token: result.tokens.accessToken, refreshToken: result.tokens.refreshToken, user: result.user }, timestamp: new Date().toISOString() });
    } catch (error) { next(error); }
  };

  private async checkRateLimit(ip: string, email: string): Promise<void> {
    try {
      const redis = getRedis();
      const keySecret = process.env.PUBLIC_TRIAL_RATE_KEY;
      if (!keySecret) throw new Error('missing PUBLIC_TRIAL_RATE_KEY');
      const emailKey = crypto.createHmac('sha256', keySecret).update(email).digest('hex');
      for (const entry of [{ key: `public-trial:ip:${ip}`, limit: 10, ttl: 900 }, { key: `public-trial:email:${emailKey}`, limit: 3, ttl: 3600 }]) {
        const count = await redis.incr(entry.key);
        if (count === 1) await redis.expire(entry.key, entry.ttl);
        if (count > entry.limit) throw new AppError(429, 'TRIAL_RATE_LIMITED', 'Tente novamente mais tarde.');
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'TRIAL_RATE_LIMIT_UNAVAILABLE', 'Serviço temporariamente indisponível.');
    }
  }
}
