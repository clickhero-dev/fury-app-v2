import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import {
  createTestTenant,
  createTestUser,
  cleanupDatabase,
  getAuthHeader,
  type TestUser,
} from './utils/test-helpers.js';
import { db, creativeAssets } from '@fury/db';

describe('GET /api/studio/assets', () => {
  let testUser: TestUser;
  let testTenant: { id: string };

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('studio-assets-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'studio@fury.test');

    const base = { tenantId: testTenant.id, url: 'https://example.com/a.png' };
    for (let i = 0; i < 25; i++) {
      await db.insert(creativeAssets).values({
        ...base,
        type: i % 2 === 0 ? 'image' : 'copy',
        url: `https://example.com/asset-${i}.png`,
        complianceStatus: i % 3 === 0 ? 'approved' : 'pending_compliance',
      });
    }
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve paginar com limit 20 e page 2', async () => {
    const page1 = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token))
      .query({ page: 1, limit: 20 });

    expect(page1.status).toBe(200);
    expect(page1.body.assets.length).toBe(20);
    expect(page1.body.total).toBe(25);
    expect(page1.body.page).toBe(1);
    expect(page1.body.totalPages).toBe(2);

    const page2 = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token))
      .query({ page: 2, limit: 20 });

    expect(page2.status).toBe(200);
    expect(page2.body.assets.length).toBe(5);
    expect(page2.body.page).toBe(2);
  });

  it('deve filtrar por type=copy', async () => {
    const res = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token))
      .query({ type: 'copy' });

    expect(res.status).toBe(200);
    expect(res.body.assets.every((a: { type: string }) => a.type === 'copy')).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('deve filtrar por status=pending incluindo pending_compliance', async () => {
    const res = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token))
      .query({ status: 'pending' });

    expect(res.status).toBe(200);
    expect(res.body.assets.length).toBeGreaterThan(0);
    expect(
      res.body.assets.every(
        (a: { complianceStatus: string }) =>
          a.complianceStatus === 'pending' || a.complianceStatus === 'pending_compliance',
      ),
    ).toBe(true);
  });

  it('deve rejeitar query invalida (400)', async () => {
    const res = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token))
      .query({ type: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });
});
