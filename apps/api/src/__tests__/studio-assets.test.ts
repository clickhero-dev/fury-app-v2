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
import { eq } from 'drizzle-orm';

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

  it('grupo com múltiplas versões aparece uma única vez na listagem (Fase 2)', async () => {
    const [root] = await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/grupo-root.png', complianceStatus: 'pending_compliance',
    }).returning();
    await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/grupo-mod1.png', complianceStatus: 'pending_compliance', rootAssetId: root.id,
    });
    await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/grupo-mod2.png', complianceStatus: 'approved', rootAssetId: root.id,
    });

    const res = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token))
      .query({ limit: 100 });

    expect(res.status).toBe(200);
    const groupUrls = ['https://example.com/grupo-root.png', 'https://example.com/grupo-mod1.png', 'https://example.com/grupo-mod2.png'];
    const cardsDoGrupo = res.body.assets.filter((a: { url: string }) => groupUrls.includes(a.url));
    expect(cardsDoGrupo.length).toBe(1);
    // sem active_asset_id setado, a evidência é a própria raiz
    expect(cardsDoGrupo[0].url).toBe('https://example.com/grupo-root.png');
  });

  it('filtro de status segue a versão em evidência, não a raiz (Fase 2)', async () => {
    const [root] = await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/evid-root.png', complianceStatus: 'approved',
    }).returning();
    const [mod] = await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/evid-mod.png', complianceStatus: 'rejected', rootAssetId: root.id,
    }).returning();
    await db.update(creativeAssets).set({ activeAssetId: mod.id }).where(eq(creativeAssets.id, root.id));

    const approvedRes = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token))
      .query({ status: 'approved', limit: 100 });
    expect(approvedRes.body.assets.some((a: { url: string }) => a.url === 'https://example.com/evid-mod.png')).toBe(false);
    expect(approvedRes.body.assets.some((a: { url: string }) => a.url === 'https://example.com/evid-root.png')).toBe(false);

    const rejectedRes = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token))
      .query({ status: 'rejected', limit: 100 });
    expect(rejectedRes.body.assets.some((a: { url: string }) => a.url === 'https://example.com/evid-mod.png')).toBe(true);
  });

  it('archived=true/false separa grupos arquivados dos ativos (Fase 2)', async () => {
    const [archivedRoot] = await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/arquivado.png', complianceStatus: 'pending_compliance',
    }).returning();
    await db.update(creativeAssets).set({ archivedAt: new Date() }).where(eq(creativeAssets.id, archivedRoot.id));

    const activeRes = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token))
      .query({ limit: 100 });
    expect(activeRes.body.assets.some((a: { url: string }) => a.url === 'https://example.com/arquivado.png')).toBe(false);

    const archivedRes = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token))
      .query({ archived: 'true', limit: 100 });
    expect(archivedRes.body.assets.some((a: { url: string }) => a.url === 'https://example.com/arquivado.png')).toBe(true);
    expect(archivedRes.body.total).toBe(1);
  });
});
