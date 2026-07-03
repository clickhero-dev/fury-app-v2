import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Set env vars before importing jwt module (requireEnv runs at module load)
process.env.JWT_SECRET = 'test-secret-123';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-456';

vi.mock('../middleware/errorHandler.js', () => ({
  AppError: class AppError extends Error {
    statusCode: number; code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message); this.statusCode = statusCode; this.code = code;
    }
  },
}));

const { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken } = await import('../lib/jwt.js');

describe('jwt', () => {
  it('generateAccessToken creates a valid token', () => {
    const token = generateAccessToken({ userId: 'u1', tenantId: 't1', email: 'a@b.com', role: 'admin' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
    expect(decoded.userId).toBe('u1');
    expect(decoded.tenantId).toBe('t1');
  });

  it('generateRefreshToken creates a valid token', () => {
    const token = generateRefreshToken('u1');
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET) as any;
    expect(decoded.userId).toBe('u1');
  });

  it('verifyAccessToken returns payload for valid token', () => {
    const token = generateAccessToken({ userId: 'u1', tenantId: 't1', email: 'a@b.com', role: 'admin' });
    const payload = verifyAccessToken(token);
    expect(payload.userId).toBe('u1');
    expect(payload.tenantId).toBe('t1');
  });

  it('verifyAccessToken throws TOKEN_EXPIRED for expired token', () => {
    const spy = vi.spyOn(jwt, 'verify').mockImplementation(() => {
      const err = new Error('jwt expired') as any;
      err.name = 'TokenExpiredError';
      throw err;
    });
    try { verifyAccessToken('any-token'); }
    catch (e: any) { expect(e.code).toBe('TOKEN_EXPIRED'); }
    spy.mockRestore();
  });

  it('verifyAccessToken throws INVALID_TOKEN for bad signature', () => {
    const bad = jwt.sign({ userId: 'u1' }, 'wrong-secret');
    try { verifyAccessToken(bad); }
    catch (e: any) { expect(e.code).toBe('INVALID_TOKEN'); }
  });

  it('verifyRefreshToken throws INVALID_REFRESH_TOKEN for bad token', () => {
    try { verifyRefreshToken('garbage'); }
    catch (e: any) { expect(e.code).toBe('INVALID_REFRESH_TOKEN'); }
  });
});
