import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseMetricsProvider } from '../lib/providers/db-metrics.provider.js';
import { MetaRepository } from '../repository/meta.repository.js';
import * as metaApi from '../lib/meta-api.js';
import * as cryptoUtils from '../utils/crypto.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * ADR-0002 + bugs do dashboard:
 * - envelope { data, partial_failures }: falha do Meta NÃO derruba a lista nem
 *   vira "nenhuma campanha" silenciosa (bugs 1+2).
 * - includeOnlyLeadForm: lista só campanhas OUTCOME_LEADS com lead form (bug 3).
 *
 * Cadeia real: DatabaseMetricsProvider → fronteira Meta mockada
 * (MetaRepository / decryptMetaToken / metaApiCall / getMetaInsights /
 * campaignHasLeadForm).
 */

function mockMetaConnection(adAccountId = 'act_1') {
  vi.spyOn(MetaRepository.prototype, 'findLatestMetaConnection').mockResolvedValue({
    accessToken: 'enc-token',
    adAccounts: [{ id: adAccountId, account_status: 1 }],
    selectedAdAccountId: adAccountId,
  } as never);
  vi.spyOn(cryptoUtils, 'decryptMetaToken').mockReturnValue('decrypted-token');
}

const OUTCOME_LEADS_WITH_FORM = '120000000000000011';
const OUTCOME_LEADS_NO_FORM = '120000000000000012';
const TRAFFIC = '120000000000000013';

function mockCampaignsList() {
  vi.spyOn(metaApi, 'metaApiCall').mockResolvedValue({
    data: [
      { id: OUTCOME_LEADS_WITH_FORM, name: 'Form', status: 'ACTIVE', objective: 'OUTCOME_LEADS' },
      { id: OUTCOME_LEADS_NO_FORM, name: 'Leads sem form', status: 'ACTIVE', objective: 'OUTCOME_LEADS' },
      { id: TRAFFIC, name: 'Trafego', status: 'ACTIVE', objective: 'OUTCOME_TRAFFIC' },
    ],
  } as never);
}

function mockInsights() {
  vi.spyOn(metaApi, 'getMetaInsights').mockResolvedValue({
    data: [{ campaign_id: OUTCOME_LEADS_WITH_FORM, spend: '10000', impressions: '500', clicks: '80' }],
  } as never);
}

describe('DatabaseMetricsProvider.getCampaigns — filtro "só formulário" (bug 3)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('includeOnlyLeadForm=true retorna só OUTCOME_LEADS com lead form', async () => {
    mockMetaConnection();
    mockCampaignsList();
    mockInsights();
    vi.spyOn(metaApi, 'campaignHasLeadForm').mockImplementation(async (id) => id === OUTCOME_LEADS_WITH_FORM);

    const provider = new DatabaseMetricsProvider();
    const res = await provider.getCampaigns('t1', '2026-09-01', '2026-09-25', undefined, 1, 10, true);

    expect(res.data.map((c) => c.id)).toEqual([OUTCOME_LEADS_WITH_FORM]);
    expect(res.data.length).toBe(1);
  });

  it('includeOnlyLeadForm=true exclui OUTCOME_LEADS sem form e campanha de tráfego', async () => {
    mockMetaConnection();
    mockCampaignsList();
    mockInsights();
    vi.spyOn(metaApi, 'campaignHasLeadForm').mockImplementation(async (id) => id === OUTCOME_LEADS_WITH_FORM);

    const provider = new DatabaseMetricsProvider();
    const res = await provider.getCampaigns('t1', '2026-09-01', '2026-09-25', undefined, 1, 10, true);

    expect(res.data.some((c) => c.id === OUTCOME_LEADS_NO_FORM)).toBe(false);
    expect(res.data.some((c) => c.id === TRAFFIC)).toBe(false);
  });

  it('includeOnlyLeadForm=false (default) mantém compat: retorna todas por status', async () => {
    mockMetaConnection();
    mockCampaignsList();
    mockInsights();
    vi.spyOn(metaApi, 'campaignHasLeadForm').mockImplementation(async (id) => id === OUTCOME_LEADS_WITH_FORM);

    const provider = new DatabaseMetricsProvider();
    const res = await provider.getCampaigns('t1', '2026-09-01', '2026-09-25');

    expect(res.data.map((c) => c.id).sort()).toEqual(
      [OUTCOME_LEADS_WITH_FORM, OUTCOME_LEADS_NO_FORM, TRAFFIC].sort()
    );
    expect(res.partial_failures).toEqual([]);
  });

  it('campanha de form cuja detecção de form FALHA é mantida (best-effort, não derruba)', async () => {
    mockMetaConnection();
    mockCampaignsList();
    mockInsights();
    vi.spyOn(metaApi, 'campaignHasLeadForm').mockRejectedValue(new AppError(403, 'META_API_ERROR', 'graph error'));

    const provider = new DatabaseMetricsProvider();
    const res = await provider.getCampaigns('t1', '2026-09-01', '2026-09-25', undefined, 1, 10, true);

    // Mantém OUTCOME_LEADS (form não confirmado) e anota a falha.
    expect(res.data.map((c) => c.id).sort()).toEqual(
      [OUTCOME_LEADS_WITH_FORM, OUTCOME_LEADS_NO_FORM].sort()
    );
    expect(res.partial_failures.length).toBeGreaterThan(0);
  });
});

describe('DatabaseMetricsProvider.getCampaigns — envelope partial_failures (bugs 1+2)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lista de campanhas FALHA (erro genérico #200) → data [] + partial_failures, NÃO throw', async () => {
    mockMetaConnection();
    vi.spyOn(metaApi, 'metaApiCall').mockRejectedValue(
      new AppError(403, 'META_API_ERROR', 'OAuthException (#200) generic')
    );
    vi.spyOn(metaApi, 'getMetaInsights').mockResolvedValue({ data: [] } as never);

    const provider = new DatabaseMetricsProvider();
    const res = await provider.getCampaigns('t1', '2026-09-01', '2026-09-25');

    expect(res.data).toEqual([]);
    expect(res.partial_failures.length).toBe(1);
    expect(res.partial_failures[0].provider).toBe('meta');
    expect(res.partial_failures[0].reason).toBeTruthy();
  });

  it('insights FALHAM mas lista de campanhas OK → campanhas retornadas + partial_failures (não vira vazio)', async () => {
    mockMetaConnection();
    mockCampaignsList();
    vi.spyOn(metaApi, 'getMetaInsights').mockRejectedValue(
      new AppError(502, 'META_INTEGRATION_ERROR', 'grafo timeout')
    );

    const provider = new DatabaseMetricsProvider();
    const res = await provider.getCampaigns('t1', '2026-09-01', '2026-09-25');

    // 3 campanhas continuam presentes (com métricas zeradas) + falha anotada.
    expect(res.data.length).toBe(3);
    expect(res.partial_failures.length).toBe(1);
  });

  it('sem conexão Meta → data [] + partial_failures META_NOT_CONNECTED (nenhum throw)', async () => {
    vi.spyOn(MetaRepository.prototype, 'findLatestMetaConnection').mockResolvedValue(null as never);

    const provider = new DatabaseMetricsProvider();
    const res = await provider.getCampaigns('t1', '2026-09-01', '2026-09-25');

    expect(res.data).toEqual([]);
    expect(res.partial_failures[0].code).toBe('META_NOT_CONNECTED');
  });
});
