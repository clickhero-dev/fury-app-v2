import jwt from 'jsonwebtoken';
import { AppError } from '../middleware/errorHandler.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key_min_32_chars_required_123456';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your_refresh_secret_key_min_32_chars_required_123456';

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

export interface RefreshTokenPayload {
  userId: string;
}

export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '15m',
  });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, {
    expiresIn: '30d',
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
