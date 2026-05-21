import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import {
  createTestTenant,
  createTestUser,
  cleanupDatabase,
  getAuthHeader,
} from './utils/test-helpers.js';

const { complianceQueueAdd } = vi.hoisted(() => ({
  complianceQueueAdd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/queue.js', () => ({
  getStudioQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({
      waitUntilFinished: vi.fn().mockResolvedValue({
        creativeAssetId: 'mock_asset_123',
        imageUrl: 'https://example.com/image.png',
        status: 'pending_compliance',
      }),
    }),
  }),
  getStudioQueueEvents: vi.fn().mockReturnValue({}),
  getComplianceQueue: vi.fn().mockReturnValue({
    add: complianceQueueAdd,
  }),
  closeStudioQueue: vi.fn(),
  closeComplianceQueue: vi.fn(),
}));

vi.mock('../lib/temp-storage.js', () => ({
  saveTemporaryStudioImage: vi.fn().mockResolvedValue({ fileName: 'image-123.png' }),
  ensureStudioAssetsDir: vi.fn(),
  studioAssetsDir: '/tmp/studio-assets',
}));

describe('POST /api/studio/generate-image', () => {
  let testUser: any;
  let testTenant: any;

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('test-tenant-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'test@fury.test');
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve retornar URL de imagem gerada', async () => {
    const response = await request(app)
      .post('/api/studio/generate-image')
      .set(getAuthHeader(testUser.token))
      .send({
        briefing: 'Uma imagem de produto de moda para mulheres',
        format: 'feed',
        style: 'fotografico',
        adAccountId: 'act_111111111',
      });

    expect(response.status).toBe(200);
    expect(response.body.creativeAssetId).toBeDefined();
    expect(response.body.imageUrl).toBeDefined();
    expect(response.body.status).toBe('pending_compliance');
    expect(complianceQueueAdd).toHaveBeenCalledTimes(1);
  });

  it('deve rejeitar briefing vazio (400)', async () => {
    const response = await request(app)
      .post('/api/studio/generate-image')
      .set(getAuthHeader(testUser.token))
      .send({
        briefing: '',
        format: 'feed',
        style: 'fotografico',
        adAccountId: 'act_111111111',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('deve rejeitar formato inválido (400)', async () => {
    const response = await request(app)
      .post('/api/studio/generate-image')
      .set(getAuthHeader(testUser.token))
      .send({
        briefing: 'Uma imagem de produto de moda para mulheres',
        format: 'invalid_format',
        style: 'fotografico',
        adAccountId: 'act_111111111',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('deve rejeitar briefing muito curto (400)', async () => {
    const response = await request(app)
      .post('/api/studio/generate-image')
      .set(getAuthHeader(testUser.token))
      .send({
        briefing: 'Short',
        format: 'feed',
        style: 'fotografico',
        adAccountId: 'act_111111111',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('deve aceitar diferentes formatos válidos', async () => {
    const formats = ['feed', 'stories', 'banner'];

    for (const format of formats) {
      const response = await request(app)
        .post('/api/studio/generate-image')
        .set(getAuthHeader(testUser.token))
        .send({
          briefing: 'Uma imagem de produto de moda para mulheres',
          format,
          style: 'fotografico',
          adAccountId: 'act_111111111',
        });

      expect(response.status).toBe(200);
      expect(response.body.creativeAssetId).toBeDefined();
    }
  });

  it('deve aceitar diferentes estilos válidos', async () => {
    const styles = ['fotografico', 'ilustracao', 'minimalista'];

    for (const style of styles) {
      const response = await request(app)
        .post('/api/studio/generate-image')
        .set(getAuthHeader(testUser.token))
        .send({
          briefing: 'Uma imagem de produto de moda para mulheres',
          format: 'feed',
          style,
          adAccountId: 'act_111111111',
        });

      expect(response.status).toBe(200);
      expect(response.body.creativeAssetId).toBeDefined();
    }
  });
});

describe('POST /api/studio/generate-copy', () => {
  let testUser: any;
  let testTenant: any;

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('test-tenant-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'test@fury.test');
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it.skip('deve retornar array de 3-5 variações', async () => {
    const response = await request(app)
      .post('/api/studio/generate-copy')
      .set(getAuthHeader(testUser.token))
      .send({
        productName: 'Camiseta Premium',
        productCategory: 'Moda',
        tone: 'profissional',
      });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.variations)).toBe(true);
    expect(response.body.variations.length).toBeGreaterThanOrEqual(3);
    expect(response.body.variations.length).toBeLessThanOrEqual(5);
  });

  it.skip('deve rejeitar tipo inválido (400)', async () => {
    const response = await request(app)
      .post('/api/studio/generate-copy')
      .set(getAuthHeader(testUser.token))
      .send({
        productName: 'Camiseta Premium',
        productCategory: 'Moda',
        tone: 'invalid_tone',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});
