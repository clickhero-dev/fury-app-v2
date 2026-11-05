import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { MetaRepository } from '../repository/meta.repository.js';
import * as metaApi from '../lib/meta-api.js';
import * as cryptoUtils from '../utils/crypto.js';

/**
 * INTEGRAÇÃO — GET /metrics/campaigns (PainelCampanhas) mostra "Clientes" de uma
 * campanha de Formulário como LEADS (quem preencheu o form), não cliques.
 *
 * Cadeia real: rota HTTP → MetricsController → MetricsService →
 * DatabaseMetricsProvider; só a fronteira Meta é mockada (padrão parity-testing).
 * Antes do fix, o provider montava "Clientes" sem `objective` → o fallback genérico
 * priorizava link_click/landing_page_view (tráfego) → campanha de Formulário exibia
 * CLIQUES como "Clientes", divergindo da página de Leads.
 */
describe('GET /api/metrics/campaigns — campanha de Formulário conta leads (integração)', () => {
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
    const email = `test-integration-${id}@test.com`;
    const password = 'SecurePass123!';
    await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email,
      password,
      companyName: `Test Company ${id}`,
    });

    const loginResponse = await request(app).post('/api/auth/login').send({ email, password });
    accessToken = loginResponse.body.data.token;
    tenantId = loginResponse.body.data.user.tenantId;

    // Billing gate: subscription ativa.
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

    // Fronteira Meta mockada: conexão, lista de campanhas e insights.
    vi.spyOn(MetaRepository.prototype, 'findLatestMetaConnection').mockResolvedValue({
      accessToken: 'enc-token',
      adAccounts: [{ id: 'act_1', account_status: 1 }],
      selectedAdAccountId: 'act_1',
    } as never);
    vi.spyOn(cryptoUtils, 'decryptMetaToken').mockReturnValue('decrypted-token');
    vi.spyOn(metaApi, 'metaApiCall').mockResolvedValue({
      data: [
        {
          id: '120000000000000001',
          name: 'Campanha Formulario',
          status: 'ACTIVE',
          objective: 'OUTCOME_LEADS',
        },
      ],
    } as never);
    vi.spyOn(metaApi, 'getMetaInsights').mockResolvedValue({
      data: [
        {
          campaign_id: '120000000000000001',
          campaign_name: 'Campanha Formulario',
          spend: '12000',
          impressions: '800',
          clicks: '150',
          actions: [
            { action_type: 'link_click', value: '140' },
            { action_type: 'landing_page_view', value: '90' },
            { action_type: 'lead', value: '11' },
          ],
          unique_actions: [{ action_type: 'lead', value: '11' }],
          purchase_roas: [],
          cost_per_action_type: [],
          action_values: [],
        },
      ],
    } as never);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await clearData();
  });

  it('listagem de campanha de Formulário retorna conversões = leads, não cliques', async () => {
    const response = await request(app)
      .get('/api/metrics/campaigns?startDate=2026-09-01&endDate=2026-09-25')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);

    const campaigns = response.body.data.campaigns || response.body.data;
    const campaign = (campaigns as any[]).find((c) => c.id === '120000000000000001');

    expect(campaign).toBeDefined();
    // leads (11) ≠ cliques (140). Se fosse o antigo fallback de tráfego, daria 90 (landing_page_view).
    expect(campaign.metrics.conversions).toBe(11);
    expect(campaign.objective).toBe('OUTCOME_LEADS');
  });
});
