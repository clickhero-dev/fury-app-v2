import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  checkRateLimit,
  getClientIp,
  isRateLimitSkipped,
  rateLimitMiddleware,
  RATE_LIMIT_MAX,
} from '../middleware/rate-limit.middleware.js';

const evalsha = vi.fn();
const scriptLoad = vi.fn().mockResolvedValue('mock-sha');

vi.mock('../lib/redis.js', () => ({
  getRedis: () => ({
    script: scriptLoad,
    evalsha,
  }),
}));

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    path: '/auth/login',
    headers: {},
    socket: { remoteAddress: '192.168.1.10' },
    ip: undefined,
    ...overrides,
  } as Request;
}

function createMockResponse() {
  const headers: Record<string, string | number> = {};
  const res = {
    statusCode: 200,
    setHeader: vi.fn((key: string, value: string | number) => {
      headers[key] = value;
    }),
    status: vi.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: { statusCode: number }, body: unknown) {
      return { statusCode: this.statusCode, body, headers };
    }),
    headers,
  };
  return res as unknown as Response & { headers: Record<string, string | number> };
}

describe('rate-limit middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evalsha.mockReset();
    scriptLoad.mockResolvedValue('mock-sha');
  });

  describe('getClientIp', () => {
    it('uses the first IP from X-Forwarded-For', () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
      });

      expect(getClientIp(req)).toBe('203.0.113.1');
    });

    it('falls back to socket remote address', () => {
      expect(getClientIp(createMockRequest())).toBe('192.168.1.10');
    });
  });

  describe('isRateLimitSkipped', () => {
    it('skips health endpoint', () => {
      expect(isRateLimitSkipped(createMockRequest({ path: '/health' }))).toBe(true);
    });

    it('does not skip regular API routes', () => {
      expect(isRateLimitSkipped(createMockRequest({ path: '/auth/login' }))).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('allows request when under the limit', async () => {
      evalsha.mockResolvedValue([1, 42]);

      const result = await checkRateLimit('192.168.1.10');

      expect(result).toEqual({ allowed: true, count: 42 });
      expect(evalsha).toHaveBeenCalledWith(
        'mock-sha',
        1,
        'rate_limit:192.168.1.10',
        expect.any(Number),
        1000,
        RATE_LIMIT_MAX,
        expect.stringMatching(/^\d+:[a-z0-9]+$/)
      );
    });

    it('blocks request when limit is exceeded', async () => {
      evalsha.mockResolvedValue([0, 100]);

      const result = await checkRateLimit('192.168.1.10');

      expect(result).toEqual({ allowed: false, count: 100 });
    });
  });

  describe('rateLimitMiddleware', () => {
    it('returns 429 when limit is exceeded', async () => {
      evalsha.mockResolvedValue([0, 100]);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn() as NextFunction;

      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      await rateLimitMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
        })
      );
      expect(res.headers['X-RateLimit-Remaining']).toBe(0);
      expect(res.headers['Retry-After']).toBe(1);
      expect(next).not.toHaveBeenCalled();

      process.env.NODE_ENV = previousEnv;
    });

    it('calls next when request is allowed', async () => {
      evalsha.mockResolvedValue([1, 10]);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn() as NextFunction;

      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      await rateLimitMiddleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.headers['X-RateLimit-Remaining']).toBe(RATE_LIMIT_MAX - 10);

      process.env.NODE_ENV = previousEnv;
    });

    it('skips enforcement in test environment', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn() as NextFunction;

      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      await rateLimitMiddleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(evalsha).not.toHaveBeenCalled();

      process.env.NODE_ENV = previousEnv;
    });

    it('fails open when Redis throws', async () => {
      evalsha.mockRejectedValue(new Error('Redis unavailable'));
      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn() as NextFunction;

      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      await rateLimitMiddleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();

      process.env.NODE_ENV = previousEnv;
    });
  });
});
