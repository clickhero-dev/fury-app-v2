import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import { tenants, users } from '@fury/db';

const redisStore = new Map<string, string>();

const emailMocks = vi.hoisted(() => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetSuccessEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/email.service.js', () => emailMocks);

vi.mock('../lib/redis.js', () => ({
  getRedis: () => ({
    keys: vi.fn(async (pattern: string) => {
      const prefix = pattern.replace('*', '');
      return [...redisStore.keys()].filter((key) => key.startsWith(prefix));
    }),
    del: vi.fn(async (...keys: string[]) => {
      keys.forEach((key) => redisStore.delete(key));
      return keys.length;
    }),
    incr: vi.fn(async (key: string) => {
      const value = Number(redisStore.get(key) || 0) + 1;
      redisStore.set(key, String(value));
      return value;
    }),
    expire: vi.fn().mockResolvedValue(1),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  }),
}));

describe('Auth Email Flow', () => {
  const uniqueId = () => Date.now().toString().slice(-8);
  const testOtp = '123456';

  const clearData = async () => {
    redisStore.clear();
    await db.delete(users);
    await db.delete(tenants);
  };

  const registerUser = async (id = uniqueId()) => {
    const email = `user-${id}@test.com`;
    const password = 'SecurePass123!';

    const response = await request(app).post('/api/auth/register').send({
      name: 'John Doe',
      email,
      password,
      companyName: `Test Company ${id}`,
    });

    return { response, email, password, id };
  };

  const setKnownOtp = async (email: string, otp = testOtp) => {
    const hash = await bcrypt.hash(otp, 12);
    await db
      .update(users)
      .set({
        emailOtpHash: hash,
        emailOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })
      .where(eq(users.email, email));
  };

  const verifyUserEmail = async (email: string, otp = testOtp) => {
    await setKnownOtp(email, otp);
    return request(app).post('/api/auth/verify-email').send({ email, otp });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearData();
  });

  describe('POST /api/auth/register', () => {
    it('should send welcome and OTP emails on registration', async () => {
      const { response, email } = await registerUser();

      expect(response.status).toBe(201);
      expect(response.body.data.user.emailVerified).toBe(false);
      expect(emailMocks.sendWelcomeEmail).toHaveBeenCalledWith(email, 'John Doe');
      expect(emailMocks.sendOtpEmail).toHaveBeenCalledWith(email, 'John Doe', expect.stringMatching(/^\d{6}$/));
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('should verify email with valid OTP', async () => {
      const { email } = await registerUser();
      const response = await verifyUserEmail(email);

      expect(response.status).toBe(200);
      expect(response.body.data.message).toBe('Email verified successfully');

      const user = await db.query.users.findFirst({ where: eq(users.email, email) });
      expect(user?.emailVerified).toBe(true);
      expect(user?.emailOtpHash).toBeNull();
    });

    it('should reject invalid OTP', async () => {
      const { email } = await registerUser();
      await setKnownOtp(email, '999999');

      const response = await request(app).post('/api/auth/verify-email').send({
        email,
        otp: '123456',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_OTP');
    });

    it('should rate limit verify-email attempts', async () => {
      const { email } = await registerUser();
      await setKnownOtp(email, '999999');

      for (let i = 0; i < 5; i++) {
        const res = await request(app).post('/api/auth/verify-email').send({ email, otp: '123456' });
        expect(res.status).toBe(400);
      }

      const blocked = await request(app).post('/api/auth/verify-email').send({ email, otp: '123456' });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should block login when email is not verified', async () => {
      const { email, password } = await registerUser();

      const response = await request(app).post('/api/auth/login').send({ email, password });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('should allow login after email verification', async () => {
      const { email, password } = await registerUser();
      await verifyUserEmail(email);

      const response = await request(app).post('/api/auth/login').send({ email, password });

      expect(response.status).toBe(200);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.user.emailVerified).toBe(true);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return the same message for existing and non-existing emails', async () => {
      const { email } = await registerUser();

      const existing = await request(app).post('/api/auth/forgot-password').send({ email });
      const missing = await request(app).post('/api/auth/forgot-password').send({ email: 'missing@test.com' });

      expect(existing.status).toBe(200);
      expect(missing.status).toBe(200);
      expect(existing.body.data.message).toBe(missing.body.data.message);
      expect(emailMocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    });

    it('should stop sending emails after rate limit without revealing it', async () => {
      const { email } = await registerUser();

      for (let i = 0; i < 3; i++) {
        const res = await request(app).post('/api/auth/forgot-password').send({ email });
        expect(res.status).toBe(200);
      }

      emailMocks.sendPasswordResetEmail.mockClear();

      const res = await request(app).post('/api/auth/forgot-password').send({ email });
      expect(res.status).toBe(200);
      expect(emailMocks.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reset password and invalidate refresh tokens', async () => {
      const { email, password, response: registerResponse } = await registerUser();
      await verifyUserEmail(email);

      const loginResponse = await request(app).post('/api/auth/login').send({ email, password });
      const refreshToken = loginResponse.body.data.tokens.refreshToken;

      const resetToken = 'a'.repeat(64);
      const resetHash = await bcrypt.hash(resetToken, 12);
      await db
        .update(users)
        .set({
          passwordResetTokenHash: resetHash,
          passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        })
        .where(eq(users.email, email));

      const resetResponse = await request(app).post('/api/auth/reset-password').send({
        email,
        token: resetToken,
        password: 'NewSecurePass123!',
      });

      expect(resetResponse.status).toBe(200);
      expect(emailMocks.sendPasswordResetSuccessEmail).toHaveBeenCalledWith(email, 'John Doe');

      const refreshResponse = await request(app).post('/api/auth/refresh').send({ refreshToken });
      expect(refreshResponse.status).toBe(401);

      const oldLogin = await request(app).post('/api/auth/login').send({ email, password });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app).post('/api/auth/login').send({
        email,
        password: 'NewSecurePass123!',
      });
      expect(newLogin.status).toBe(200);
    });
  });
});
