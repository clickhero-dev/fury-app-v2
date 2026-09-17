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

/**
 * Fase 3 — GET /studio/assets/:assetId (histórico do grupo) e
 * POST /studio/assets/:assetId/set-active (versão em evidência).
 */
describe('GET /api/studio/assets/:assetId — histórico do grupo', () => {
  let testUser: TestUser;
  let testTenant: { id: string };
  let rootId: string;
  let mod1Id: string;
  let mod2Id: string;

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('studio-detail-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'studio-detail@fury.test');

    const [root] = await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/root.png', complianceStatus: 'pending_compliance',
    }).returning();
    rootId = root.id;

    const [mod1] = await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/mod1.png', complianceStatus: 'pending_compliance', rootAssetId: rootId,
    }).returning();
    mod1Id = mod1.id;

    const [mod2] = await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/mod2.png', complianceStatus: 'approved', rootAssetId: rootId,
    }).returning();
    mod2Id = mod2.id;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('a partir do id da raiz, devolve o grupo inteiro (versions[]) e a evidência default (a raiz)', async () => {
    const res = await request(app)
      .get(`/api/studio/assets/${rootId}`)
      .set(getAuthHeader(testUser.token));

    expect(res.status).toBe(200);
    expect(res.body.groupId).toBe(rootId);
    expect(res.body.activeVersionId).toBe(rootId);
    expect(res.body.assetId).toBe(rootId);
    expect(res.body.versions.map((v: any) => v.id).sort()).toEqual([rootId, mod1Id, mod2Id].sort());
    expect(res.body.versions[0].id).toBe(rootId); // ordenado por createdAt asc — raiz é a mais antiga
  });

  it('a partir do id de uma MODIFICAÇÃO (não a raiz), resolve pro mesmo grupo e pra mesma evidência', async () => {
    const res = await request(app)
      .get(`/api/studio/assets/${mod1Id}`)
      .set(getAuthHeader(testUser.token));

    expect(res.status).toBe(200);
    expect(res.body.groupId).toBe(rootId);
    // Sem set-active chamado ainda, a evidência é a raiz — mesmo pedindo detalhe de mod1Id
    expect(res.body.activeVersionId).toBe(rootId);
    expect(res.body.assetId).toBe(rootId);
    expect(res.body.versions.length).toBe(3);
  });

  it('POST set-active muda a versão em evidência do grupo', async () => {
    const setActiveRes = await request(app)
      .post(`/api/studio/assets/${mod2Id}/set-active`)
      .set(getAuthHeader(testUser.token));

    expect(setActiveRes.status).toBe(200);
    expect(setActiveRes.body.activeVersionId).toBe(mod2Id);
    expect(setActiveRes.body.assetId).toBe(mod2Id);
    expect(setActiveRes.body.complianceStatus).toBe('approved');

    // Persistido — uma nova consulta (a partir de qualquer id do grupo) reflete a mudança
    const getRes = await request(app)
      .get(`/api/studio/assets/${rootId}`)
      .set(getAuthHeader(testUser.token));
    expect(getRes.body.activeVersionId).toBe(mod2Id);
  });

  it('set-active funciona também em grupo arquivado', async () => {
    await db.update(creativeAssets).set({ archivedAt: new Date() }).where(eq(creativeAssets.id, rootId));

    const res = await request(app)
      .post(`/api/studio/assets/${mod1Id}/set-active`)
      .set(getAuthHeader(testUser.token));

    expect(res.status).toBe(200);
    expect(res.body.activeVersionId).toBe(mod1Id);
    expect(res.body.archivedAt).not.toBeNull();
  });

  it('set-active com assetId de outro tenant retorna 404 (escopo por tenant)', async () => {
    const otherTenant = await createTestTenant('studio-detail-other-' + Date.now());
    const [otherAsset] = await db.insert(creativeAssets).values({
      tenantId: otherTenant.id, type: 'image', url: 'https://example.com/other.png', complianceStatus: 'pending_compliance',
    }).returning();

    const res = await request(app)
      .post(`/api/studio/assets/${otherAsset.id}/set-active`)
      .set(getAuthHeader(testUser.token));

    expect(res.status).toBe(404);
  });
});

describe('DELETE/restore /api/studio/assets/:assetId — arquivar em vez de apagar (Fase 4)', () => {
  let testUser: TestUser;
  let testTenant: { id: string };
  let rootId: string;
  let modId: string;

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('studio-archive-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'studio-archive@fury.test');

    const [root] = await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/arch-root.png', complianceStatus: 'pending_compliance',
    }).returning();
    rootId = root.id;

    const [mod] = await db.insert(creativeAssets).values({
      tenantId: testTenant.id, type: 'image', url: 'https://example.com/arch-mod.png', complianceStatus: 'approved', rootAssetId: rootId,
    }).returning();
    modId = mod.id;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('DELETE arquiva o grupo inteiro — nenhuma linha é removida do banco', async () => {
    const res = await request(app)
      .delete(`/api/studio/assets/${modId}`) // chamado com o id de uma MODIFICAÇÃO, não da raiz
      .set(getAuthHeader(testUser.token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const rows = await db.query.creativeAssets.findMany({ where: eq(creativeAssets.rootAssetId, rootId) });
    expect(rows.length).toBe(1); // a modificação continua existindo — não foi apagada

    const root = await db.query.creativeAssets.findFirst({ where: eq(creativeAssets.id, rootId) });
    expect(root?.archivedAt).not.toBeNull();

    // some da listagem padrão
    const listRes = await request(app)
      .get('/api/studio/assets')
      .set(getAuthHeader(testUser.token));
    expect(listRes.body.total).toBe(0);

    // aparece na listagem de arquivados
    const archivedRes = await request(app)
      .get('/api/studio/assets?archived=true')
      .set(getAuthHeader(testUser.token));
    expect(archivedRes.body.total).toBe(1);
  });

  it('DELETE é idempotente — arquivar um grupo já arquivado não dá erro', async () => {
    await request(app).delete(`/api/studio/assets/${rootId}`).set(getAuthHeader(testUser.token));
    const second = await request(app).delete(`/api/studio/assets/${rootId}`).set(getAuthHeader(testUser.token));
    expect(second.status).toBe(200);
  });

  it('POST restore devolve o grupo pra listagem principal', async () => {
    await request(app).delete(`/api/studio/assets/${rootId}`).set(getAuthHeader(testUser.token));

    const restoreRes = await request(app)
      .post(`/api/studio/assets/${modId}/restore`) // restaura a partir do id de uma modificação
      .set(getAuthHeader(testUser.token));
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);

    const root = await db.query.creativeAssets.findFirst({ where: eq(creativeAssets.id, rootId) });
    expect(root?.archivedAt).toBeNull();

    const listRes = await request(app).get('/api/studio/assets').set(getAuthHeader(testUser.token));
    expect(listRes.body.total).toBe(1);
  });

  it('POST restore num grupo que NÃO está arquivado retorna 400 (não sucesso silencioso)', async () => {
    const res = await request(app)
      .post(`/api/studio/assets/${rootId}/restore`)
      .set(getAuthHeader(testUser.token));

    expect(res.status).toBe(400);
  });
});
