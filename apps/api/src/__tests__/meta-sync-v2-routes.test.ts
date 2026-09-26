// =============================================================================
// BDD — T005: Endpoints v2 (router real + controller real + deps fake)
//
/*
# Language: pt-BR

Funcionalidade: Endpoints v2 de dados Meta (direto do banco, fallback stale)

  Cenário: listar campanhas com dados frescos (happy)
    Dado dados do banco com run de sucesso recente
    Quando GET /api/v2/campaigns com auth + tenant
    Então 200 com data (array de campanhas) e syncedAt
    E NÃO dispara sync inline

  Cenário: parâmetros inválidos → 400
    Dado GET /api/v2/campaigns?limit=abc
    Então 400 VALIDATION_ERROR (zod)

  Cenário: sem autenticação → 401
    Dado GET /api/v2/campaigns sem Authorization
    Então 401

  Cenário: token sem tenant → 403
    Dado JWT sem tenantId
    Então 403 FORBIDDEN

  Cenário: dado stale (>15min) dispara sync inline e retorna fresco
    Dado último run de sucesso há mais de 15min
    Quando GET /api/v2/campaigns
    Então metaSyncService.syncTenant é chamado (reason stale-fallback)
    E a resposta vem com syncedAt atualizado

  Cenário: Meta fora → 502 quando não há dados no banco
    Dado sync inline retorna status failed e não há dados
    Quando GET /api/v2/campaigns
    Então 502 META_API_ERROR

  Cenário: sync parcial expõe partial_failures
    Dado sync inline retorna status partial com partial_failures
    Quando GET /api/v2/metrics/summary
    Então 200 com partial_failures no envelope

  Cenário: detalhe da campanha
    Dado snapshot existente
    Quando GET /api/v2/campaigns/:id
    Então 200 com data + metrics + syncedAt

  Cenário: leads de campanha
    Dado leads persistidos
    Quando GET /api/v2/campaigns/:id/leads
    Então 200 com data (array de leads)

  Cenário: todas as leads com campaignName
    Dado leads persistidos + snapshots
    Quando GET /api/v2/leads
    Então 200 com campaignName mapeado

  Cenário: lead-campaigns (OUTCOME_LEADS com form)
    Dado snapshots OUTCOME_LEADS com form
    Quando GET /api/v2/lead-campaigns
    Então 200 com [{ id, name }]

  Cenário: summary diário e instagram-insights
    Dado snapshots e mídia Instagram persistidos
    Quando GET /api/v2/metrics/daily e /api/v2/dashboard/instagram-insights
    Então 200 com os agregados e syncedAt
*/
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { createV2Router } from '../routes/v2.routes.js';
import { MetaSyncV2Controller } from '../controllers/meta-sync.controller.js';

function authToken(tenantId: string, withTenant = true): string {
  return jwt.sign(
    { userId: 'user-1', ...(withTenant ? { tenantId } : {}), email: 'diogommtdes@gmail.com', role: 'owner' },
    process.env.JWT_SECRET ?? 'test-jwt-secret',
  );
}

const TENANT = 'd4e3f2c1-0000-4000-8000-00000000000d';

function makeFakes(overrides: Record<string, unknown> = {}) {
  const repo = {
    lastSuccessfulRun: vi.fn(async () => ({ startedAt: new Date(Date.now() - 60_000) })),
    findCampaignSnapshots: vi.fn(async () => ({
      items: [
        {
          id: 's1',
          tenantId: TENANT,
          metaCampaignId: 'm1',
          name: 'Camp 1',
          status: 'ACTIVE',
          objective: 'OUTCOME_SALES',
          budget: {},
          metrics: { spend: 100, impressions: 1000, clicks: 10, ctr: 1, cpc: 10, cpm: 100, conversions: 5, roas: 2.5, cpa: 20 },
          hasLeadForm: false,
          lastInsightsAt: new Date(),
        },
      ],
      total: 1,
    })),
    findCampaignSnapshotByMetaId: vi.fn(async () => ({
      id: 's1',
      tenantId: TENANT,
      metaCampaignId: 'm1',
      name: 'Camp 1',
      status: 'ACTIVE',
      objective: 'OUTCOME_SALES',
      budget: {},
      metrics: { spend: 100, impressions: 1000, clicks: 10, ctr: 1, cpc: 10, cpm: 100, conversions: 5, roas: 2.5, cpa: 20 },
      hasLeadForm: false,
      lastInsightsAt: new Date(),
    })),
    findLeadsByCampaign: vi.fn(async () => ({
      items: [
        { id: 'l1', metaLeadId: 'lead-1', metaCampaignId: 'm1', name: 'Maria', email: 'maria@x.com', phone: '5511', createdTime: new Date() },
      ],
      total: 1,
    })),
    findAllLeads: vi.fn(async () => ({
      items: [
        { id: 'l1', metaLeadId: 'lead-1', metaCampaignId: 'm1', name: 'Maria', email: 'maria@x.com', phone: '5511', createdTime: new Date() },
      ],
      total: 1,
    })),
    findLeadCampaigns: vi.fn(async () => [
      { metaCampaignId: 'm1', name: 'Camp 1', objective: 'OUTCOME_LEADS', hasLeadForm: true },
    ]),
    findInstagramInsights: vi.fn(async () => [
      { id: 'ig1', mediaId: 'media-1', commentsCount: 4, insights: { saved: 3, reach: 100 } },
    ]),
    findClientGoal: vi.fn(async () => null),
    ...(overrides.repo ?? {}),
  };

  const service = {
    syncTenant: vi.fn(async () => ({
      status: 'success',
      partialFailures: [],
      campaignsCount: 1,
      leadsCount: 0,
      insightsCount: 0,
    })),
    ...(overrides.service ?? {}),
  };

  const controller = new MetaSyncV2Controller(service as never, () => repo as never);
  return { repo, service, controller };
}

function buildApp(controller: MetaSyncV2Controller) {
  const app = express();
  app.use(express.json());
  app.use('/api/v2', authMiddleware, tenantMiddleware, createV2Router(controller));
  app.use(errorHandler);
  return app;
}

describe('BDD: Endpoints v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Cenário: listar campanhas com dados frescos (happy) → 200 + syncedAt, sem sync inline', async () => {
    const { repo, service, controller } = makeFakes();
    const app = buildApp(controller);

    const res = await request(app).get('/api/v2/campaigns').set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].id).toBe('m1');
    expect(res.body.syncedAt).toBeTruthy();
    expect(res.body.pagination.total).toBe(1);
    expect(service.syncTenant).not.toHaveBeenCalled();
  });

  it('Cenário: parâmetros inválidos → 400', async () => {
    const { controller } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app)
      .get('/api/v2/campaigns?limit=abc')
      .set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('Cenário: sem autenticação → 401', async () => {
    const { controller } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app).get('/api/v2/campaigns');
    expect(res.status).toBe(401);
  });

  it('Cenário: token sem tenant → 403', async () => {
    const { controller } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app).get('/api/v2/campaigns').set('Authorization', `Bearer ${authToken(TENANT, false)}`);
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('Cenário: dado stale (>15min) dispara sync inline e retorna fresco', async () => {
    const { repo, service, controller } = makeFakes({
      repo: { lastSuccessfulRun: vi.fn(async () => ({ startedAt: new Date(Date.now() - 30 * 60 * 1000) })) },
    });
    const app = buildApp(controller);

    const res = await request(app).get('/api/v2/campaigns').set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(200);
    expect(service.syncTenant).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, reason: 'stale-fallback' })
    );
  });

  it('Cenário: Meta fora e sem dados → 502 META_API_ERROR', async () => {
    const { repo, service, controller } = makeFakes({
      repo: {
        lastSuccessfulRun: vi.fn(async () => null),
        findCampaignSnapshots: vi.fn(async () => ({ items: [], total: 0 })),
      },
      service: {
        syncTenant: vi.fn(async () => ({
          status: 'failed',
          errorCode: 'META_TIMEOUT',
          errorMessage: 'timeout',
          partialFailures: [],
          campaignsCount: 0,
          leadsCount: 0,
          insightsCount: 0,
        })),
      },
    });
    const app = buildApp(controller);

    const res = await request(app).get('/api/v2/campaigns').set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe('META_API_ERROR');
  });

  it('Cenário: sync parcial expõe partial_failures no envelope', async () => {
    const { repo, service, controller } = makeFakes({
      repo: { lastSuccessfulRun: vi.fn(async () => ({ startedAt: new Date(Date.now() - 30 * 60 * 1000) })) },
      service: {
        syncTenant: vi.fn(async () => ({
          status: 'partial',
          partialFailures: [{ item_id: 'm2', provider: 'meta', code: 'META_INTEGRATION_ERROR', reason: 'x' }],
          campaignsCount: 1,
          leadsCount: 0,
          insightsCount: 0,
        })),
      },
    });
    const app = buildApp(controller);

    const res = await request(app)
      .get('/api/v2/metrics/summary')
      .set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(200);
    expect(res.body.partial_failures.length).toBe(1);
    expect(res.body.partial_failures[0].item_id).toBe('m2');
  });

  it('Cenário: detalhe da campanha → 200 com metrics + syncedAt; inexistente → 404', async () => {
    const { repo, controller } = makeFakes();
    const app = buildApp(controller);

    const ok = await request(app).get('/api/v2/campaigns/m1').set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.id).toBe('m1');

    repo.findCampaignSnapshotByMetaId.mockResolvedValueOnce(null);
    const nf = await request(app).get('/api/v2/campaigns/nope').set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(nf.status).toBe(404);
  });

  it('Cenário: leads de campanha → 200', async () => {
    const { controller } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app)
      .get('/api/v2/campaigns/m1/leads')
      .set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].email).toBe('maria@x.com');
  });

  it('Cenário: todas as leads com campaignName → 200', async () => {
    const { controller } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app).get('/api/v2/leads').set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].campaignId).toBe('m1');
    expect(res.body.data[0].campaignName).toBe('Camp 1');
  });

  it('Cenário: lead-campaigns → 200 [{ id, name }]', async () => {
    const { controller } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app).get('/api/v2/lead-campaigns').set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ id: 'm1', name: 'Camp 1' });
  });

  it('Cenário: metrics/daily e instagram-insights → 200', async () => {
    const { controller } = makeFakes();
    const app = buildApp(controller);

    const daily = await request(app)
      .get('/api/v2/metrics/daily')
      .set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(daily.status).toBe(200);
    expect(daily.body.data[0]).toHaveProperty('date');
    expect(daily.body.data[0]).toHaveProperty('spend');

    const ig = await request(app)
      .get('/api/v2/dashboard/instagram-insights')
      .set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(ig.status).toBe(200);
    expect(ig.body.data).toHaveProperty('comments');
    expect(ig.body.data).toHaveProperty('saves');
  });
});