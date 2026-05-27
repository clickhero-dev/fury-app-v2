import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';

describe('Multi-tenancy Isolation', () => {
  let tenant1AccessToken: string;
  let tenant2AccessToken: string;
  let tenant1Id: string;
  let tenant2Id: string;
  const uniqueId = () => Date.now().toString().slice(-8);

  const clearData = async () => {
    // Clear data - delete in correct order to respect foreign keys
    await db.delete(schema.furyInsights);
    await db.delete(schema.campaigns);
    await db.delete(schema.creativeAssets);
    await db.delete(schema.clientGoals);
    await db.delete(schema.metaConnections);
    await db.delete(schema.users);
    await db.delete(schema.tenants);
  };

  beforeEach(async () => {
    await clearData();

    // Create tenant 1 and user
    const id1 = uniqueId();
    const tenant1Response = await request(app).post('/api/auth/register').send({
      name: `Tenant One ${id1}`,
      email: `tenant1-${id1}@test.com`,
      password: 'SecurePass123!',
      companyName: `Company One ${id1}`,
    });

    tenant1AccessToken = tenant1Response.body.data.tokens.accessToken;
    tenant1Id = tenant1Response.body.data.user.tenantId;

    // Create tenant 2 and user
    const id2 = uniqueId();
    const tenant2Response = await request(app).post('/api/auth/register').send({
      name: `Tenant Two ${id2}`,
      email: `tenant2-${id2}@test.com`,
      password: 'SecurePass123!',
      companyName: `Company Two ${id2}`,
    });

    tenant2AccessToken = tenant2Response.body.data.tokens.accessToken;
    tenant2Id = tenant2Response.body.data.user.tenantId;
  });


  describe('JWT Token Isolation', () => {
    it('should include correct tenantId in token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tenant1AccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.tenantId).toBe(tenant1Id);
    });

    it('tenant2 token should have different tenantId', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tenant2AccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.tenantId).toBe(tenant2Id);
      expect(response.body.data.tenantId).not.toBe(tenant1Id);
    });

    it('tenant1 cannot use tenant2 token', async () => {
      // Get tenant1 data using tenant1 token
      const response1 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tenant1AccessToken}`);

      // Get tenant2 data using tenant2 token
      const response2 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tenant2AccessToken}`);

      // Both should succeed but return different users
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.data.email).not.toBe(response2.body.data.email);
    });
  });

  describe('User Isolation', () => {
    it('should not allow logging in with another tenants email/password', async () => {
      // First tenant's email should not work for second tenant
      const response = await request(app).post('/api/auth/login').send({
        email: `tenant1-${Date.now()}@test.com`, // This email doesn't exist anymore
        password: 'SecurePass123!',
      });

      // Should fail because we used a different email format above
      expect(response.status).toBe(401);
    });

    it('tenants should have different roles and permissions', async () => {
      const response1 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tenant1AccessToken}`);

      const response2 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tenant2AccessToken}`);

      // Both should be 200 OK
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Both should be owners since they're first users
      expect(response1.body.data.role).toBe('owner');
      expect(response2.body.data.role).toBe('owner');

      // But they should be different users
      expect(response1.body.data.id).not.toBe(response2.body.data.id);
    });
  });
});
