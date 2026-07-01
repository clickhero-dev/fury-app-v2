import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { db, users, tenants } from '@fury/db';
import { seedStartup } from '../lib/seed-superadmin.js';

const DEMO_EMAIL = 'dev.fashion@fury.test';
const DEMO_PASSWORD = 'Dev@12345';
const ADMIN_EMAIL = 'admin@fury.com.br';
const ADMIN_PASSWORD = 'admin@123';

describe('Seed & Login — Demo + Superadmin', () => {
  beforeAll(async () => {
    // Clean
    await db.delete(users);
    await db.delete(tenants);

    // Set env vars for superadmin seed
    process.env.SUPERADMIN_EMAIL = ADMIN_EMAIL;
    process.env.SUPERADMIN_PASSWORD = ADMIN_PASSWORD;

    // Run seed (creates demo + superadmin)
    await seedStartup();
  });

  describe('Demo user login', () => {
    it('deve logar com credenciais demo corretas', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe(DEMO_EMAIL);
      expect(res.body.data.user.role).toBe('owner');
    });

    it('deve retornar 401 com senha errada', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: DEMO_EMAIL,
        password: 'SenhaErrada123',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Superadmin login', () => {
    it('deve logar com credenciais de superadmin corretas', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe(ADMIN_EMAIL);
      expect(res.body.data.user.role).toBe('superadmin');
    });

    it('deve retornar 401 com senha errada', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: ADMIN_EMAIL,
        password: 'SenhaErrada123',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Seed idempotency', () => {
    it('deve ser seguro rodar o seed múltiplas vezes', async () => {
      // Run seed again — should not throw or duplicate
      await expect(seedStartup()).resolves.toBeUndefined();

      // Both users should still exist and log in
      const demoRes = await request(app).post('/api/auth/login').send({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      expect(demoRes.status).toBe(200);

      const adminRes = await request(app).post('/api/auth/login').send({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });
      expect(adminRes.status).toBe(200);
    });
  });
});
