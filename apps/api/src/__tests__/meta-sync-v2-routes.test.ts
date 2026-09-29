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

  Cenário: snapshot stale (>3h) é servido e refresh é enfileirado
    Dado último run de sucesso há mais de 3h
    Quando GET /api/v2/campaigns
    Então o snapshot é retornado com degraded=true
    E o refresh é enfileirado sem sync inline

  Cenário: sem snapshot → resposta rápida de primeira sincronização
    Dado ainda não há run ou snapshots
    Quando GET /api/v2/campaigns
    Então 200 com coleção vazia, degraded=true e refresh enfileirado

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

  Cenário: alterar status de um lead (manual, transições livres)
    Dado lead persistido no tenant
    Quando PATCH /api/v2/leads/:id/status com { status: "negociando" }
    Então 200 com { success, data: { id, status } }
    E repository.updateLeadStatus chamado com status válido

  Cenário: status inválido → 400
    Dado body com status fora do enum
    Quando PATCH /api/v2/leads/:id/status
    Então 400 VALIDATION_ERROR

  Cenário: body vazio → 400
    Dado PATCH sem body
    Quando PATCH /api/v2/leads/:id/status
    Então 400 VALIDATION_ERROR

  Cenário: lead inexistente → 404
    Dado nenhum lead com o id no tenant
    Quando PATCH /api/v2/leads/:id/status
    Então 404 LEAD_NOT_FOUND

  Cenário: lead removido durante a alteração → 404
    Dado o lead deixa de existir antes da gravação
    Quando PATCH /api/v2/leads/:id/status
    Então 404 LEAD_NOT_FOUND sem confirmar uma alteração inexistente
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
    findCampaignDailyInsights: vi.fn(async () => [
      { metaCampaignId: 'm1', date: '2026-09-25', metrics: { spend: 12, conversions: 2, clicks: 5, impressions: 100 } },
      { metaCampaignId: 'm1', date: '2026-09-26', metrics: { spend: 8, conversions: 1, clicks: 3, impressions: 80 } },
    ]),
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
    updateLeadStatus: vi.fn(async () => true),
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

  const enqueueMetaSync = vi.fn(async () => {});
  const controller = new MetaSyncV2Controller(service as never, () => repo as never, enqueueMetaSync);
  return { repo, service, enqueueMetaSync, controller };
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

  it('Cenário: intervalo de campanha com data malformada → 400', async () => {
    const app = buildApp(makeFakes().controller);
    const res = await request(app)
      .get('/api/v2/campaigns?startDate=2026-02-31&endDate=2026-03-01')
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

  it('Cenário: dado com 2h de idade não está degradado nem enfileira refresh', async () => {
    const { service, enqueueMetaSync, controller } = makeFakes({
      repo: { lastSuccessfulRun: vi.fn(async () => ({ startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })) },
    });
    const app = buildApp(controller);

    const res = await request(app).get('/api/v2/campaigns').set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.degraded).toBe(false);
    expect(service.syncTenant).not.toHaveBeenCalled();
    expect(enqueueMetaSync).not.toHaveBeenCalled();
  });

  it('Cenário: dado stale (>3h) serve snapshot e enfileira refresh sem sync inline', async () => {
    const { repo, service, enqueueMetaSync, controller } = makeFakes({
      repo: { lastSuccessfulRun: vi.fn(async () => ({ startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000) })) },
    });
    const app = buildApp(controller);

    const res = await request(app).get('/api/v2/campaigns').set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.degraded).toBe(true);
    expect(res.body.staleForMs).toBeGreaterThan(3 * 60 * 60 * 1000);
    expect(service.syncTenant).not.toHaveBeenCalled();
    expect(enqueueMetaSync).toHaveBeenCalledWith({ tenantId: TENANT, reason: 'stale-fallback' });
  });

  it('Cenário: campanhas usa métricas diárias persistidas para o período selecionado', async () => {
    const { controller, repo } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app)
      .get('/api/v2/campaigns?startDate=2026-09-25&endDate=2026-09-26')
      .set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(repo.findCampaignDailyInsights).toHaveBeenCalledWith({ startDate: '2026-09-25', endDate: '2026-09-26' });
    expect(res.body.data[0]).toMatchObject({ spend: 20, conversions: 3, clicks: 8, impressions: 180 });
  });

  it('Cenário: rotas da tela de clientes servem o snapshot stale sem esperar sync inline', async () => {
    const { repo, service, enqueueMetaSync, controller } = makeFakes({
      repo: { lastSuccessfulRun: vi.fn(async () => ({ startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000) })) },
    });
    const app = buildApp(controller);

    const [campaigns, leads] = await Promise.all([
      request(app).get('/api/v2/lead-campaigns').set('Authorization', `Bearer ${authToken(TENANT)}`),
      request(app).get('/api/v2/leads').set('Authorization', `Bearer ${authToken(TENANT)}`),
    ]);

    expect(campaigns.status).toBe(200);
    expect(campaigns.body.data).toHaveLength(1);
    expect(leads.status).toBe(200);
    expect(leads.body.data).toHaveLength(1);
    expect(service.syncTenant).not.toHaveBeenCalled();
    expect(enqueueMetaSync).toHaveBeenCalledTimes(2);
    expect(enqueueMetaSync).toHaveBeenCalledWith({ tenantId: TENANT, reason: 'stale-fallback' });
    expect(repo.findLeadCampaigns).toHaveBeenCalledTimes(1);
    expect(repo.findAllLeads).toHaveBeenCalledTimes(1);
  });

  it('Cenário: sem snapshot → 200 degradado e agenda primeira sincronização', async () => {
    const { repo, service, enqueueMetaSync, controller } = makeFakes({
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
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.degraded).toBe(true);
    expect(res.body.firstSyncPending).toBe(true);
    expect(enqueueMetaSync).toHaveBeenCalledWith({ tenantId: TENANT, reason: 'stale-fallback' });
    expect(service.syncTenant).not.toHaveBeenCalled();
  });

  it('Cenário: leituras cache-first não aguardam nem expõem o resultado de sync em background', async () => {
    const { repo, service, enqueueMetaSync, controller } = makeFakes({
      repo: { lastSuccessfulRun: vi.fn(async () => ({ startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000) })) },
    });
    const app = buildApp(controller);

    const res = await request(app)
      .get('/api/v2/metrics/summary')
      .set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(res.status).toBe(200);
    expect(res.body.degraded).toBe(true);
    expect(res.body.partial_failures).toEqual([]);
    expect(service.syncTenant).not.toHaveBeenCalled();
    expect(enqueueMetaSync).toHaveBeenCalledOnce();
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

  it('Cenário: metrics/daily retorna métricas diárias persistidas, sem rateio de totais', async () => {
    const { controller, repo } = makeFakes();
    const app = buildApp(controller);
    const daily = await request(app)
      .get('/api/v2/metrics/daily?startDate=2026-09-25&endDate=2026-09-26')
      .set('Authorization', `Bearer ${authToken(TENANT)}`);

    expect(repo.findCampaignDailyInsights).toHaveBeenCalledWith({ startDate: '2026-09-25', endDate: '2026-09-26' });
    expect(daily.body.data).toEqual([
      { date: '2026-09-25', spend: 12, conversions: 2, roas: 0, clicks: 5, impressions: 100 },
      { date: '2026-09-26', spend: 8, conversions: 1, roas: 0, clicks: 3, impressions: 80 },
    ]);
  });

  it('Cenário: summary respeita o período usando métricas diárias persistidas', async () => {
    const { controller, repo } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app)
      .get('/api/v2/metrics/summary?startDate=2026-09-25&endDate=2026-09-26')
      .set('Authorization', `Bearer ${authToken(TENANT)}`);
    expect(repo.findCampaignDailyInsights).toHaveBeenCalledWith({ startDate: '2026-09-25', endDate: '2026-09-26' });
    expect(res.body.data.summary).toMatchObject({ spend: 20, conversions: 3, clicks: 8, impressions: 180 });
  });

  it('Cenário: alterar status de um lead → 200 + update no repo', async () => {
    const { controller, repo } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app)
      .patch('/api/v2/leads/l1/status')
      .set('Authorization', `Bearer ${authToken(TENANT)}`)
      .send({ status: 'negociando' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ id: 'l1', status: 'negociando' });
    expect(repo.updateLeadStatus).toHaveBeenCalledWith('l1', 'negociando');
  });

  it('Cenário: status inválido → 400 VALIDATION_ERROR', async () => {
    const { controller, repo } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app)
      .patch('/api/v2/leads/l1/status')
      .set('Authorization', `Bearer ${authToken(TENANT)}`)
      .send({ status: 'status-inexistente' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(repo.updateLeadStatus).not.toHaveBeenCalled();
  });

  it('Cenário: body vazio → 400 VALIDATION_ERROR', async () => {
    const { controller, repo } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app)
      .patch('/api/v2/leads/l1/status')
      .set('Authorization', `Bearer ${authToken(TENANT)}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(repo.updateLeadStatus).not.toHaveBeenCalled();
  });

  it('Cenário: lead inexistente → 404 LEAD_NOT_FOUND', async () => {
    const { controller, repo } = makeFakes();
    repo.updateLeadStatus.mockResolvedValueOnce(false);
    const app = buildApp(controller);
    const res = await request(app)
      .patch('/api/v2/leads/lead-inexistente/status')
      .set('Authorization', `Bearer ${authToken(TENANT)}`)
      .send({ status: 'negociando' });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('LEAD_NOT_FOUND');
    expect(repo.updateLeadStatus).toHaveBeenCalledWith('lead-inexistente', 'negociando');
  });

  it('Cenário: lead removido durante a alteração → 404 LEAD_NOT_FOUND', async () => {
    const { controller, repo } = makeFakes({ repo: { updateLeadStatus: vi.fn(async () => false) } });
    const app = buildApp(controller);
    const res = await request(app)
      .patch('/api/v2/leads/l1/status')
      .set('Authorization', `Bearer ${authToken(TENANT)}`)
      .send({ status: 'negociando' });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('LEAD_NOT_FOUND');
    expect(repo.updateLeadStatus).toHaveBeenCalledWith('l1', 'negociando');
  });

  it('Cenário: sem autenticação → 401', async () => {
    const { controller } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app)
      .patch('/api/v2/leads/l1/status')
      .send({ status: 'negociando' });
    expect(res.status).toBe(401);
  });

  it('Cenário: token sem tenant → 403', async () => {
    const { controller } = makeFakes();
    const app = buildApp(controller);
    const res = await request(app)
      .patch('/api/v2/leads/l1/status')
      .set('Authorization', `Bearer ${authToken(TENANT, false)}`)
      .send({ status: 'negociando' });
    expect(res.status).toBe(403);
  });
});
