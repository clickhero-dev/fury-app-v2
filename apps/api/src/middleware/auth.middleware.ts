import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../lib/jwt.js';
import { AppError } from './errorHandler.js';

/**
 * Quickstart / local mock: base64 JSON `{"userId":"..."}` (see quickstart_metrics.md).
 * Only allowed when META_USE_MOCK=true and not in production.
 */
function tryParseMockQuickstartToken(rawToken: string): AccessTokenPayload | null {
  const token = rawToken.trim();
  try {
    const json = Buffer.from(token, 'base64').toString('utf8').trim();
    const parsed = JSON.parse(json) as { userId?: unknown };
    if (typeof parsed?.userId === 'string' && parsed.userId.length > 0) {
      const id = parsed.userId;
      return {
        userId: id,
        tenantId: id,
        email: 'mock@quickstart.local',
        role: 'mock',
      };
    }
  } catch {
    // not a mock token
  }
  return null;
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid authorization header'));
  }

  const token = authHeader.substring(7).trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
    };
    return next();
  } catch (jwtError) {
    const allowMockToken =
      process.env.META_USE_MOCK === 'true' && process.env.NODE_ENV !== 'production';
    if (allowMockToken) {
      const mockPayload = tryParseMockQuickstartToken(token);
      if (mockPayload) {
        req.user = {
          userId: mockPayload.userId,
          tenantId: mockPayload.tenantId,
          email: mockPayload.email,
          role: mockPayload.role,
        };
        return next();
      }
    }
    next(jwtError);
  }
}
