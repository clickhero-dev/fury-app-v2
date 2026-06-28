import jwt from 'jsonwebtoken';
import { AppError } from '../middleware/errorHandler.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[FURY] ${name} env var is required`);
  return value;
}

const JWT_SECRET = requireEnv('JWT_SECRET');
const JWT_REFRESH_SECRET = requireEnv('JWT_REFRESH_SECRET');

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  isSuperadmin: boolean;
}

export interface RefreshTokenPayload {
  userId: string;
}

// process.env values are `string`, not ms's branded `StringValue` — cast via unknown
type JwtExpiry = jwt.SignOptions['expiresIn'];

export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as unknown as JwtExpiry,
  });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as unknown as JwtExpiry,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded as AccessTokenPayload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'Invalid access token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    return decoded as RefreshTokenPayload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(401, 'REFRESH_TOKEN_EXPIRED', 'Refresh token has expired');
    }
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  }
}
