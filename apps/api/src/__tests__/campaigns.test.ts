import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import {
  createTestTenant,
  createTestUser,
  createTestMetaConnection,
  cleanupDatabase,
  getAuthHeader,
} from './utils/test-helpers.js';
import { db, campaigns } from '@fury/db';
import { eq } from 'drizzle-orm';

// Mock the meta-api
vi.mock('../lib/meta-api', () => ({
  metaApiCall: vi.fn().mockResolvedValue({ id: 'mock_campaign_id_123' }),
  decryptAccessToken: vi.fn((token) => token),
  encryptAccessToken: vi.fn((token) => token),
}));

describe('POST /api/campaigns/create', () => {
  let testUser: any;
  let testTenant: any;

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('test-tenant-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'test@fury.test');
    await createTestMetaConnection(testTenant.id);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve criar campanha e retornar id do Meta', async () => {
    const response = await request(app)
      .post('/api/campaigns/create')
      .set(getAuthHeader(testUser.token))
      .send({
        name: 'Test Campaign',
        objective: 'OUTCOME_SALES',
        dailyBudget: 1000,
        adAccountId: 'act_111111111',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.metaCampaignId).toBeDefined();
  });

  it('deve rejeitar orçamento abaixo de R$5,00 (400)', async () => {
    const response = await request(app)
      .post('/api/campaigns/create')
      .set(getAuthHeader(testUser.token))
      .send({
        name: 'Test Campaign',
        objective: 'OUTCOME_SALES',
        dailyBudget: 400, // 4,00 em centavos
        adAccountId: 'act_111111111',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('deve rejeitar adAccount de outro tenant (403)', async () => {
    const otherTenant = await createTestTenant('other-tenant-' + Date.now());
    await createTestMetaConnection(otherTenant.id, ['act_999999999']);

    const response = await request(app)
      .post('/api/campaigns/create')
      .set(getAuthHeader(testUser.token))
      .send({
        name: 'Test Campaign',
        objective: 'OUTCOME_SALES',
        dailyBudget: 1000,
        adAccountId: 'act_999999999',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBeDefined();
  });
});

describe('PATCH /api/campaigns/:id/pause', () => {
  let testUser: any;
  let testTenant: any;
  let testCampaign: any;

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('test-tenant-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'test@fury.test');
    await createTestMetaConnection(testTenant.id);

    // Create a test campaign
    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: testTenant.id,
        metaCampaignId: 'test_meta_id_123',
        name: 'Test Campaign',
        status: 'active',
        budget: { daily_budget: 1000 },
      })
      .returning();

    testCampaign = campaign;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve pausar campanha ativa', async () => {
    const response = await request(app)
      .patch(`/api/campaigns/${testCampaign.id}/pause`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const pausedCampaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, testCampaign.id),
    });

    expect(pausedCampaign?.status).toBe('paused');
  });

  it('deve retornar 404 se campanha não existe', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .patch(`/api/campaigns/${fakeId}/pause`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(404);
    expect(response.body.error).toBeDefined();
  });

  it('deve retornar 403 se campanha é de outro tenant', async () => {
    const otherTenant = await createTestTenant('other-tenant-' + Date.now());
    await createTestMetaConnection(otherTenant.id);

    const [otherCampaign] = await db
      .insert(campaigns)
      .values({
        tenantId: otherTenant.id,
        metaCampaignId: 'other_meta_id_456',
        name: 'Other Campaign',
        status: 'active',
        budget: { daily_budget: 1000 },
      })
      .returning();

    const response = await request(app)
      .patch(`/api/campaigns/${otherCampaign.id}/pause`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(403);
    expect(response.body.error).toBeDefined();
  });
});

describe('PATCH /api/campaigns/:id/resume', () => {
  let testUser: any;
  let testTenant: any;
  let testCampaign: any;

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('test-tenant-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'test@fury.test');
    await createTestMetaConnection(testTenant.id);

    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: testTenant.id,
        metaCampaignId: 'test_meta_id_123',
        name: 'Test Campaign',
        status: 'paused',
        budget: { daily_budget: 1000 },
      })
      .returning();

    testCampaign = campaign;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve reativar campanha pausada', async () => {
    const response = await request(app)
      .patch(`/api/campaigns/${testCampaign.id}/resume`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const resumedCampaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, testCampaign.id),
    });

    expect(resumedCampaign?.status).toBe('active');
  });
});

describe('PATCH /api/campaigns/:id/budget', () => {
  let testUser: any;
  let testTenant: any;
  let testCampaign: any;

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('test-tenant-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'test@fury.test');
    await createTestMetaConnection(testTenant.id);

    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: testTenant.id,
        metaCampaignId: 'test_meta_id_123',
        name: 'Test Campaign',
        status: 'active',
        budget: { daily_budget: 1000 },
      })
      .returning();

    testCampaign = campaign;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve atualizar orçamento no banco', async () => {
    const newBudget = 2000;

    const response = await request(app)
      .patch(`/api/campaigns/${testCampaign.id}/budget`)
      .set(getAuthHeader(testUser.token))
      .send({ dailyBudget: newBudget });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updatedCampaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, testCampaign.id),
    });

    expect(updatedCampaign?.budget).toHaveProperty('daily_budget', newBudget);
  });
});
