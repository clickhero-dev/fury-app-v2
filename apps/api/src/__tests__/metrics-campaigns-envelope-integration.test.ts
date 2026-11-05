import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { MetaRepository } from '../repository/meta.repository.js';
import * as metaApi from '../lib/meta-api.js';
import * as cryptoUtils from '../utils/crypto.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * INTEGRAÇÃO (rota real) — GET /metrics/campaigns
 * Cadeia HTTP → MetricsController → MetricsService → DatabaseMetricsProvider;
 * só o fronteira Meta é mockada.
 *
 * Bugs do dashboard:
 *  - AC1.1/AC1.2: falha do Meta → 200 + partial_failures (NUNCA "nenhuma campanha"
 *    sem motivo);
 *  - AC3.1: includeOnlyLeadForm=true lista só campanha OUTCOME_LEADS com form.
 */
describe('GET /api/metrics/campaigns — envelope + filtro form (integração)', () => {
  let accessToken: string;
  let tenantId: string;
  const uniqueId = () => Date.now().toString().slice(-8);

  const clearData = async () => {
    await db.delete(schema.furyInsights);
    await db.delete(schema.campaigns);
    await db.delete(schema.clientGoals);
    await db.delete(schema.metaConnections);
    await db.delete(schema.creativeAssets);
    await db.delete(schema.users);
    await db.delete(schema.tenants);
  };

  beforeAll(async () => {
    await clearData();
    const id = uniqueId();
    await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: `test-int-${id}@test.com`,
      password: 'SecurePass123!',
      companyName: `Test Company ${id}`,
    });
    const loginResponse = await request(app).post('/api/auth/login').send({
      email: `test-int-${id}@test.com`,
      password: 'SecurePass123!',
    });
    accessToken = loginResponse.body.data.token;
    tenantId = loginResponse.body.data.user.tenantId;

    const [plan] = await db
      .insert(schema.plans)
      .values({ name: 'Test Plan', priceCents: 100, interval: 'monthly', isActive: true })
      .returning();
    await db.insert(schema.subscriptions).values({
      tenantId,
      planId: plan.id,
      status: 'active',
      isNonExpirable: true,
    });

    vi.spyOn(MetaRepository.prototype, 'findLatestMetaConnection').mockResolvedValue({
      accessToken: 'enc-token',
      adAccounts: [{ id: 'act_1', account_status: 1 }],
      selectedAdAccountId: 'act_1',
    } as never);
    vi.spyOn(cryptoUtils, 'decryptMetaToken').mockReturnValue('decrypted-token');
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await clearData();
  });

  it('AC3.1 — includeOnlyLeadForm=true retorna apenas campanha OUTCOME_LEADS com form', async () => {
    vi.spyOn(metaApi, 'metaApiCall').mockResolvedValue({
      data: [
        { id: '120000000000000021', name: 'Form', status: 'ACTIVE', objective: 'OUTCOME_LEADS' },
        { id: '120000000000000022', name: 'Trafego', status: 'ACTIVE', objective: 'OUTCOME_TRAFFIC' },
      ],
    } as never);
    vi.spyOn(metaApi, 'getMetaInsights').mockResolvedValue({
      data: [{ campaign_id: '120000000000000021', spend: '10000', impressions: '500', clicks: '80' }],
    } as never);
    vi.spyOn(metaApi, 'campaignHasLeadForm').mockResolvedValue(true);

    const response = await request(app)
      .get('/api/metrics/campaigns?includeOnlyLeadForm=true&startDate=2026-09-01&endDate=2026-09-25')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    const campaigns = response.body.data.campaigns as any[];
    expect(campaigns.map((c) => c.name)).toEqual(['Form']);
    expect(campaigns.some((c) => c.name === 'Trafego')).toBe(false);
  });

  it('AC1.2 — falha do Meta #200 genérico → 200 + partial_failures (não lista vazia sem motivo)', async () => {
    vi.spyOn(metaApi, 'metaApiCall').mockRejectedValue(
      new AppError(403, 'META_API_ERROR', 'OAuthException (#200) generic')
    );
    vi.spyOn(metaApi, 'campaignHasLeadForm').mockResolvedValue(true);

    const response = await request(app)
      .get('/api/metrics/campaigns?startDate=2026-09-01&endDate=2026-09-25')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(Array.isArray(data.campaigns)).toBe(true);
    expect(data.partial_failures.length).toBeGreaterThan(0);
    expect(data.partial_failures[0].provider).toBe('meta');
    expect(data.partial_failures[0].reason).toBeTruthy();
  });
});
