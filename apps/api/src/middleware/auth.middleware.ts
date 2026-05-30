import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../lib/jwt.js';
import { AppError } from './errorHandler.js';

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

function verifyTokenAndSetUser(token: string, req: Request): boolean {
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
    };
    return true;
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
        return true;
      }
    }
    throw jwtError;
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid authorization header'));
  }

  const token = authHeader.substring(7).trim();

  try {
    verifyTokenAndSetUser(token, req);
    return next();
  } catch (jwtError) {
    next(jwtError);
  }
}

export function authSSEMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = (req.query.token as string) || req.headers.authorization?.substring(7).trim();

  if (!token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Missing token in query parameter or Authorization header'));
  }

  try {
    verifyTokenAndSetUser(token, req);
    return next();
  } catch (jwtError) {
    next(jwtError);
  }
}
