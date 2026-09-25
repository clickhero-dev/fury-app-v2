import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseMetricsProvider } from '../lib/providers/db-metrics.provider.js';
import { MetaRepository } from '../repository/meta.repository.js';
import * as metaApi from '../lib/meta-api.js';
import * as cryptoUtils from '../utils/crypto.js';

/**
 * RED — campanha de Formulário (OUTCOME_LEADS) deve contar quem preencheu o form
 * (= action types de lead), não cliques.
 *
 * `/metrics/campaigns` (PainelCampanhas, coluna "Clientes") chamava
 * `extractCampaignMetricsFromInsight(insight, spendReais)` SEM `objective`, então
 * `getConversionActionTypesForObjective(undefined)` caía no fallback genérico que
 * prioriza `link_click`/`landing_page_view` (tráfego). Para uma campanha de Formulário
 * isso exibia CLIQUES como "Clientes" — divergindo da página de Leads (que conta por
 * `/{form_id}/leads`, ou seja, pessoas que preencheram).
 *
 * Com o fix, a listagem passa o `objective` da campanha → para OUTCOME_LEADS resolve
 * para os action types de lead (`lead`, `onsite_conversion.lead`...), contando quem
 * preencheu o formulário.
 */

const leadInsight = {
  campaign_id: '120000000000000001',
  campaign_name: 'Campanha Formulario',
  spend: '10000', // R$100,00
  impressions: '500',
  clicks: '80',
  actions: [
    { action_type: 'link_click', value: '78' },
    { action_type: 'landing_page_view', value: '40' },
    { action_type: 'lead', value: '9' },
  ],
  unique_actions: [{ action_type: 'lead', value: '7' }],
  purchase_roas: [],
  cost_per_action_type: [],
  action_values: [],
};

function mockMetaConnection(adAccountId = 'act_1') {
  vi.spyOn(MetaRepository.prototype, 'findLatestMetaConnection').mockResolvedValue({
    accessToken: 'enc-token',
    adAccounts: [{ id: adAccountId, account_status: 1 }],
    selectedAdAccountId: adAccountId,
  } as never);
  vi.spyOn(cryptoUtils, 'decryptMetaToken').mockReturnValue('decrypted-token');
}

describe('DatabaseMetricsProvider.getCampaigns — conversões objective-aware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('OUTCOME_LEADS conta leads (quem preencheu o form), não cliques', async () => {
    mockMetaConnection();

    // Lista de campanhas Meta: uma campanha de Formulário.
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
      data: [leadInsight],
    } as never);

    const provider = new DatabaseMetricsProvider();
    const { data } = await provider.getCampaigns('t1', '2026-09-01', '2026-09-25');

    const campaign = data.find((c) => c.id === '120000000000000001');
    expect(campaign).toBeDefined();
    // Falha hoje: sem objective, cai no fallback de tráfego → retorna link_click (78).
    // O correto é o lead único (unique_actions.lead = 7) = pessoas que preencheram.
    expect(campaign!.metrics.conversions).toBe(7);
  });

  it('OUTCOME_TRAFFIC continua contando tráfego (não regride)', async () => {
    mockMetaConnection();

    vi.spyOn(metaApi, 'metaApiCall').mockResolvedValue({
      data: [
        {
          id: '120000000000000002',
          name: 'Campanha Trafego',
          status: 'ACTIVE',
          objective: 'OUTCOME_TRAFFIC',
        },
      ],
    } as never);

    const trafficInsight = {
      campaign_id: '120000000000000002',
      campaign_name: 'Campanha Trafego',
      spend: '5000',
      impressions: '300',
      clicks: '50',
      actions: [
        { action_type: 'link_click', value: '48' },
        { action_type: 'lead', value: '3' },
      ],
      unique_actions: [{ action_type: 'link_click', value: '48' }],
      purchase_roas: [],
      cost_per_action_type: [],
      action_values: [],
    };

    vi.spyOn(metaApi, 'getMetaInsights').mockResolvedValue({
      data: [trafficInsight],
    } as never);

    const provider = new DatabaseMetricsProvider();
    const { data } = await provider.getCampaigns('t1', '2026-09-01', '2026-09-25');

    const campaign = data.find((c) => c.id === '120000000000000002');
    expect(campaign!.metrics.conversions).toBe(48);
  });
});
