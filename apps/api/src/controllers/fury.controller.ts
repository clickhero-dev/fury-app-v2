import { Request, Response, NextFunction } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db, furyInsights } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { furyAnalyze } from '../services/fury-engine.service.js';
import { getRedis } from '../lib/redis.js';

const RATE_LIMIT_TTL = 3600; // 1 hour in seconds

export async function analyze(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }
    const rateLimitKey = `fury:analyze:${tenantId}`;

    try {
      const redis = getRedis();
      const lastRun = await redis.get(rateLimitKey);
      if (lastRun) {
        const ttl = await redis.ttl(rateLimitKey);
        throw new AppError(
          429,
          'RATE_LIMIT_EXCEEDED',
          `Analysis already ran recently. Try again in ${Math.ceil(ttl / 60)} minute(s).`
        );
      }
      await redis.set(rateLimitKey, '1', 'EX', RATE_LIMIT_TTL);
    } catch (redisErr) {
      if (redisErr instanceof AppError) throw redisErr;
      // Redis unavailable — skip rate limiting
      console.warn('[FURY] Redis unavailable, skipping rate limit');
    }

    const insights = await furyAnalyze(tenantId);

    res.json({
      success: true,
      data: insights,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function getInsights(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }
    const insights = await db
      .select()
      .from(furyInsights)
      .where(eq(furyInsights.tenantId, tenantId))
      .orderBy(desc(furyInsights.createdAt))
      .limit(10);

    res.json({
      success: true,
      data: insights,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
