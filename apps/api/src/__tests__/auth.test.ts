import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { db } from '@fury/db';
import { tenants, users } from '@fury/db';

describe('Auth Endpoints', () => {
  beforeEach(async () => {
    // Clear users and tenants before each test
    await db.delete(users);
    await db.delete(tenants);
  });

  describe('POST /api/auth/register', () => {
    it('should create tenant + user and return valid tokens', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: `john-${Date.now()}@test.com`,
        password: 'SecurePass123!',
        companyName: `Test Company ${Date.now()}`,
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tokens');
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
      expect(response.body.data.user).toEqual(
        expect.objectContaining({
          role: 'owner',
          id: expect.any(String),
          email: expect.any(String),
          tenantId: expect.any(String),
        })
      );
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('should return 409 if email already exists', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@test.com',
        password: 'SecurePass123!',
        companyName: 'Test Company',
      };

      // First registration
      await request(app).post('/api/auth/register').send(userData);

      // Second registration with same email
      const response = await request(app).post('/api/auth/register').send(userData);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should validate email format', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: 'invalid-email',
        password: 'SecurePass123!',
        companyName: 'Test Company',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate password length', async () => {
      const response = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'short',
        companyName: 'Test Company',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Clear and create a user before login tests
      await db.delete(users);
      await db.delete(tenants);

      await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'SecurePass123!',
        companyName: 'Test Company',
      });
    });

    it('should return tokens with valid credentials', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'john@test.com',
        password: 'SecurePass123!',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tokens');
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe('john@test.com');
    });

    it('should return 401 with invalid credentials', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'john@test.com',
        password: 'WrongPassword123!',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return 401 for non-existent email', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@test.com',
        password: 'SecurePass123!',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Create a user and get token
      const registerResponse = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'SecurePass123!',
        companyName: 'Test Company',
      });

      accessToken = registerResponse.body.data.tokens.accessToken;
    });

    it('should return user data with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          email: 'john@test.com',
          role: 'owner',
        })
      );
      expect(response.body.data).not.toHaveProperty('passwordHash');
    });

    it('should return 401 without token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token_12345');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should return 401 with malformed authorization header', async () => {
      const response = await request(app).get('/api/auth/me').set('Authorization', 'InvalidFormat');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const registerResponse = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'SecurePass123!',
        companyName: 'Test Company',
      });

      refreshToken = registerResponse.body.data.tokens.refreshToken;
    });

    it('should return new tokens with valid refresh token', async () => {
      const response = await request(app).post('/api/auth/refresh').send({
        refreshToken,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tokens');
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
      expect(response.body.data.tokens.accessToken).toBeDefined();
    });

    it('should return 401 with invalid refresh token', async () => {
      const response = await request(app).post('/api/auth/refresh').send({
        refreshToken: 'invalid_token',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    let accessToken: string;

    beforeEach(async () => {
      const registerResponse = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'SecurePass123!',
        companyName: 'Test Company',
      });

      accessToken = registerResponse.body.data.tokens.accessToken;
    });

    it('should logout successfully with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 401 without token', async () => {
      const response = await request(app).post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
