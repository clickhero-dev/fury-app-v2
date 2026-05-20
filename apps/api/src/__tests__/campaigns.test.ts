import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import {
  createTestTenant,
  createTestUser,
  createTestMetaConnection,
  cleanupDatabase,
  getAuthHeader,
  type TestUser,
} from './utils/test-helpers.js';
import { db, campaigns, furyInsights, automationRules } from '@fury/db';
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

describe('PATCH /api/campaigns/:id', () => {
  let testUser: TestUser;
  let testTenant: { id: string };
  let testCampaign: { id: string };

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('tenant-update-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'update@fury.test');
    await createTestMetaConnection(testTenant.id);

    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: testTenant.id,
        metaCampaignId: 'meta_update_1',
        name: 'Original Name',
        status: 'active',
        budget: { daily_budget: 1000, objective: 'OUTCOME_SALES' },
      })
      .returning();

    testCampaign = campaign;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve atualizar nome da campanha', async () => {
    const response = await request(app)
      .patch(`/api/campaigns/${testCampaign.id}`)
      .set(getAuthHeader(testUser.token))
      .send({ name: 'Updated Name' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updated = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, testCampaign.id),
    });

    expect(updated?.name).toBe('Updated Name');
  });

  it('deve atualizar orçamento diário', async () => {
    const response = await request(app)
      .patch(`/api/campaigns/${testCampaign.id}`)
      .set(getAuthHeader(testUser.token))
      .send({
        budget: {
          amount: 2000,
          type: 'daily',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updated = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, testCampaign.id),
    });

    const budgetObj = updated?.budget as Record<string, unknown>;
    expect(budgetObj?.daily_budget).toBe(2000);
  });

  it('deve retornar 403 para campanha de outro tenant', async () => {
    const otherTenant = await createTestTenant('other-update-' + Date.now());
    const [otherCampaign] = await db
      .insert(campaigns)
      .values({
        tenantId: otherTenant.id,
        metaCampaignId: 'other_update',
        name: 'Other',
        status: 'active',
        budget: {},
      })
      .returning();

    const response = await request(app)
      .patch(`/api/campaigns/${otherCampaign.id}`)
      .set(getAuthHeader(testUser.token))
      .send({ name: 'Hacked' });

    expect(response.status).toBe(403);
  });
});

describe('PATCH /api/campaigns/:id/status', () => {
  let testUser: TestUser;
  let testTenant: { id: string };
  let testCampaign: { id: string };

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('tenant-status-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'status@fury.test');
    await createTestMetaConnection(testTenant.id);

    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: testTenant.id,
        metaCampaignId: 'meta_status_1',
        name: 'Status Test',
        status: 'active',
        budget: {},
      })
      .returning();

    testCampaign = campaign;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve mudar status para PAUSED', async () => {
    const response = await request(app)
      .patch(`/api/campaigns/${testCampaign.id}/status`)
      .set(getAuthHeader(testUser.token))
      .send({ status: 'PAUSED' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updated = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, testCampaign.id),
    });

    expect(updated?.status).toBe('paused');
  });

  it('deve mudar status para ARCHIVED', async () => {
    const response = await request(app)
      .patch(`/api/campaigns/${testCampaign.id}/status`)
      .set(getAuthHeader(testUser.token))
      .send({ status: 'ARCHIVED' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updated = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, testCampaign.id),
    });

    expect(updated?.status).toBe('archived');
  });

  it('deve registrar log de mudança de status', async () => {
    await request(app)
      .patch(`/api/campaigns/${testCampaign.id}/status`)
      .set(getAuthHeader(testUser.token))
      .send({ status: 'PAUSED' });

    const logs = await db.query.furyInsights.findMany({
      where: eq(furyInsights.campaignId, testCampaign.id),
    });

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].suggestionType).toContain('campaign_status');
  });
});

describe('DELETE /api/campaigns/:id', () => {
  let testUser: TestUser;
  let testTenant: { id: string };
  let testCampaign: { id: string };

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('tenant-delete-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'delete@fury.test');
    await createTestMetaConnection(testTenant.id);

    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: testTenant.id,
        metaCampaignId: 'meta_delete_1',
        name: 'Delete Test',
        status: 'active',
        budget: {},
      })
      .returning();

    testCampaign = campaign;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve arquivar campanha (soft delete)', async () => {
    const response = await request(app)
      .delete(`/api/campaigns/${testCampaign.id}`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const archived = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, testCampaign.id),
    });

    expect(archived?.status).toBe('archived');
  });

  it('deve registrar log de exclusão', async () => {
    await request(app)
      .delete(`/api/campaigns/${testCampaign.id}`)
      .set(getAuthHeader(testUser.token));

    const logs = await db.query.furyInsights.findMany({
      where: eq(furyInsights.campaignId, testCampaign.id),
    });

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].suggestionType).toBe('campaign_archived');
  });

  it('deve retornar 403 para campanha de outro tenant', async () => {
    const otherTenant = await createTestTenant('other-delete-' + Date.now());
    const [otherCampaign] = await db
      .insert(campaigns)
      .values({
        tenantId: otherTenant.id,
        metaCampaignId: 'other_delete',
        name: 'Other',
        status: 'active',
        budget: {},
      })
      .returning();

    const response = await request(app)
      .delete(`/api/campaigns/${otherCampaign.id}`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(403);
  });
});

describe('GET /api/campaigns/:id/insights', () => {
  let testUser: TestUser;
  let testTenant: { id: string };
  let testCampaign: { id: string };

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('tenant-insights-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'insights@fury.test');
    await createTestMetaConnection(testTenant.id);

    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: testTenant.id,
        metaCampaignId: 'meta_insights_1',
        name: 'Insights Test',
        status: 'active',
        budget: {},
        metrics: { spend: 100, impressions: 1000, clicks: 50, ctr: 0.05, cpm: 10, conversions: 5 },
      })
      .returning();

    testCampaign = campaign;
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve retornar insights com série temporal para last_30d', async () => {
    const response = await request(app)
      .get(`/api/campaigns/${testCampaign.id}/insights?date_range=last_30d`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.campaign).toBeDefined();
    expect(response.body.data.campaign.id).toBe(testCampaign.id);
    expect(Array.isArray(response.body.data.timeseries)).toBe(true);
  });

  it('deve suportar date_range last_7d', async () => {
    const response = await request(app)
      .get(`/api/campaigns/${testCampaign.id}/insights?date_range=last_7d`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.timeseries)).toBe(true);
  });

  it('deve suportar custom date range', async () => {
    const startDate = '2024-01-01';
    const endDate = '2024-01-31';

    const response = await request(app)
      .get(`/api/campaigns/${testCampaign.id}/insights?date_range=custom&start_date=${startDate}&end_date=${endDate}`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('deve retornar 404 para campanha inexistente', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app)
      .get(`/api/campaigns/${fakeId}/insights`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(404);
  });

  it('deve retornar 404 para campanha de outro tenant', async () => {
    const otherTenant = await createTestTenant('other-insights-' + Date.now());
    const [otherCampaign] = await db
      .insert(campaigns)
      .values({
        tenantId: otherTenant.id,
        metaCampaignId: 'other_insights',
        name: 'Other',
        status: 'active',
        budget: {},
      })
      .returning();

    const response = await request(app)
      .get(`/api/campaigns/${otherCampaign.id}/insights`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(404);
  });
});

describe('GET /api/campaigns', () => {
  let testUser: TestUser;
  let testTenant: { id: string };

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('tenant-list-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'list@fury.test');
    await createTestMetaConnection(testTenant.id);

    await db
      .insert(campaigns)
      .values([
        {
          tenantId: testTenant.id,
          metaCampaignId: 'meta_1',
          name: 'Campaign 1',
          status: 'active',
          budget: { daily_budget: 1000, objective: 'OUTCOME_SALES' },
          metrics: { spend: 100, roas: 2, cpa: 5, ctr: 0.02, cpc: 0.5, conversions: 20, impressions: 5000, clicks: 100 },
        },
        {
          tenantId: testTenant.id,
          metaCampaignId: 'meta_2',
          name: 'Campaign 2',
          status: 'paused',
          budget: { daily_budget: 500, objective: 'OUTCOME_LEADS' },
          metrics: { spend: 50, roas: 1.5, cpa: 3, ctr: 0.01, cpc: 0.3, conversions: 10, impressions: 3000, clicks: 30 },
        },
        {
          tenantId: testTenant.id,
          metaCampaignId: 'meta_3',
          name: 'Campaign 3',
          status: 'active',
          budget: { daily_budget: 2000, objective: 'OUTCOME_TRAFFIC' },
          metrics: { spend: 200, roas: 3, cpa: 4, ctr: 0.03, cpc: 0.6, conversions: 50, impressions: 7000, clicks: 210 },
        },
      ]);
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve listar todas as campanhas do tenant com limite padrão', async () => {
    const response = await request(app)
      .get('/api/campaigns')
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBe(3);
    expect(response.body.pagination.total).toBe(3);
    expect(response.body.pagination.limit).toBe(20);
    expect(response.body.pagination.offset).toBe(0);
  });

  it('deve filtrar campanhas por status', async () => {
    const response = await request(app)
      .get('/api/campaigns?status=active')
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.length).toBe(2);
    expect(response.body.data.every((c: any) => c.status === 'active')).toBe(true);
    expect(response.body.pagination.total).toBe(2);
  });

  it('deve suportar limite e offset', async () => {
    const response = await request(app)
      .get('/api/campaigns?limit=2&offset=0')
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(2);
    expect(response.body.pagination.limit).toBe(2);
    expect(response.body.pagination.offset).toBe(0);
    expect(response.body.pagination.total).toBe(3);
  });

  it('deve retornar campos corretos para cada campanha', async () => {
    const response = await request(app)
      .get('/api/campaigns?limit=1')
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    const campaign = response.body.data[0];

    expect(campaign).toHaveProperty('id');
    expect(campaign).toHaveProperty('name');
    expect(campaign).toHaveProperty('status');
    expect(campaign).toHaveProperty('objective');
    expect(campaign).toHaveProperty('budget');
    expect(campaign).toHaveProperty('spend');
    expect(campaign).toHaveProperty('impressions');
    expect(campaign).toHaveProperty('clicks');
    expect(campaign).toHaveProperty('ctr');
    expect(campaign).toHaveProperty('cpc');
    expect(campaign).toHaveProperty('roas');
    expect(campaign).toHaveProperty('cpa');
    expect(campaign).toHaveProperty('conversions');
  });

  it('deve isolar campanhas por tenant', async () => {
    const otherTenant = await createTestTenant('other-list-' + Date.now());
    const otherUser = await createTestUser(otherTenant.id, 'other@fury.test');
    await createTestMetaConnection(otherTenant.id);

    await db.insert(campaigns).values({
      tenantId: otherTenant.id,
      metaCampaignId: 'other_meta',
      name: 'Other Tenant Campaign',
      status: 'active',
      budget: {},
      metrics: {},
    });

    const response = await request(app)
      .get('/api/campaigns')
      .set(getAuthHeader(otherUser.token));

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(1);
    expect(response.body.data[0].name).toBe('Other Tenant Campaign');
  });

  it('deve rejeitar requisição sem autenticação', async () => {
    const response = await request(app).get('/api/campaigns');

    expect(response.status).toBe(401);
  });
});

describe('GET /api/campaigns/:id', () => {
  let testUser: TestUser;
  let testTenant: { id: string };
  let testCampaign: { id: string };

  beforeEach(async () => {
    await cleanupDatabase();
    testTenant = await createTestTenant('tenant-camp-detail-' + Date.now());
    testUser = await createTestUser(testTenant.id, 'detail@fury.test');
    await createTestMetaConnection(testTenant.id);

    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenantId: testTenant.id,
        metaCampaignId: 'meta_detail_1',
        name: 'Campanha Detalhe',
        status: 'active',
        budget: { daily_budget: 1000, objective: 'OUTCOME_SALES' },
        metrics: { spend: 10, roas: 2, cpa: 5, ctr: 0.02, cpm: 3, conversions: 4, impressions: 1000 },
      })
      .returning();

    testCampaign = campaign;

    await db.insert(furyInsights).values({
      tenantId: testTenant.id,
      campaignId: testCampaign.id,
      suggestionType: 'smart_takedown',
      suggestionData: { reason: 'test', ruleType: 'pause_high_cpa' },
    });

    await db.insert(automationRules).values({
      tenantId: testTenant.id,
      name: 'pause_high_cpa',
      trigger: 'pause_high_cpa',
      ruleType: 'pause_high_cpa',
      isActive: true,
      threshold: '50',
      action: 'pause',
    });
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it('deve retornar campanha, takedowns e regras ativas', async () => {
    const response = await request(app)
      .get(`/api/campaigns/${testCampaign.id}`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(200);
    expect(response.body.campaign).toBeDefined();
    expect(response.body.campaign.id).toBe(testCampaign.id);
    expect(response.body.campaign.objective).toBe('OUTCOME_SALES');
    expect(response.body.campaign.metrics).toMatchObject({
      spend: 10,
      roas: 2,
      cpa: 5,
      ctr: 0.02,
      cpm: 3,
      conversions: 4,
      impressions: 1000,
    });
    expect(Array.isArray(response.body.recentTakedowns)).toBe(true);
    expect(response.body.recentTakedowns.length).toBe(1);
    expect(response.body.recentTakedowns[0].suggestionType).toBe('smart_takedown');
    expect(Array.isArray(response.body.automationRules)).toBe(true);
    expect(response.body.automationRules.length).toBe(1);
    expect(response.body.automationRules[0].ruleType).toBe('pause_high_cpa');
  });

  it('deve retornar 404 para campanha de outro tenant', async () => {
    const otherTenant = await createTestTenant('other-detail-' + Date.now());
    const [otherCampaign] = await db
      .insert(campaigns)
      .values({
        tenantId: otherTenant.id,
        metaCampaignId: 'meta_other',
        name: 'Outra',
        status: 'active',
        budget: {},
      })
      .returning();

    const response = await request(app)
      .get(`/api/campaigns/${otherCampaign.id}`)
      .set(getAuthHeader(testUser.token));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Campanha não encontrada');
  });
});
