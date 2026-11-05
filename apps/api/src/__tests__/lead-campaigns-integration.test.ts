import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CampaignsService } from '../services/campaigns/campaigns.service.js';
import { DefaultMetaCampaignProvider } from '../lib/providers/default-meta-campaign.provider.js';
import { MockCampaignRepository } from '../lib/providers/mock-campaign.repository.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * INTEGRAÇÃO: `getLeadCampaigns` com o provider REAL da Meta (DefaultMetaCampaignProvider)
 * e a camada HTTP mockada em `globalThis.fetch` — exercita o caminho completo
 * listAccountCampaigns + campaignHasLeadForm (serialização/parsing) contra a
 * FORMA REAL da resposta do Graph API. Garante que o filtro "campanhas com
 * formulário" funciona de ponta a ponta e NUNCA derruba a listagem.
 */
describe('Integration — CampaignsService.getLeadCampaigns (provider real Meta)', () => {
  const TENANT_ID = 'tenant-1';

  beforeEach(() => {
    delete process.env.META_API_MOCK; // força caminho real (fetch)
    delete process.env.META_SYSTEM_ACCESS_TOKEN;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeService() {
    const repo = new MockCampaignRepository();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: [],
      createdAt: new Date(),
    } as any);
    const deps = {
      decryptMetaToken: (t: string) => `${t}_decrypted`,
      invalidateCampaignsCache: async () => {},
      getMetaLocationsCache: async () => null as any,
      setMetaLocationsCache: async () => {},
      getResolvedTenantAssetSelection: async () => ({ pages: [] }),
    } as any;
    const service = new CampaignsService(new DefaultMetaCampaignProvider(), repo, deps);
    return service;
  }

  /** Mock do fetch da Graph API, roteando por caminho. */
  function mockFetch(route: (url: string) => { ok: boolean; status: number; body: unknown }) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const r = route(url);
      return { ok: r.ok, status: r.status, json: async () => r.body } as unknown as Response;
    });
  }

  it('retorna apenas campanhas OUTCOME_LEADS cujo criativo referencia formulário (ativas E pausadas); erro de uma campanha não derruba', async () => {
    const service = makeService();

    mockFetch((url) => {
      // Lista de campanhas da conta (shape real: id,name,objective,status)
      if (/\/act_123\/campaigns/.test(url)) {
        return {
          ok: true, status: 200,
          body: {
            data: [
              { id: 'mc1', name: 'Ativa c/ form', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
              { id: 'mc5', name: 'Pausada c/ form', objective: 'OUTCOME_LEADS', status: 'PAUSED' },
              { id: 'mc2', name: 'Sem form', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
              { id: 'mc3', name: 'Erro no ads', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
              { id: 'mc4', name: 'Tráfego', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE' },
            ],
          },
        };
      }
      // Ads por campanha — form vive no criativo (link_data/object_story_spec)
      if (/\/mc1\/ads/.test(url)) {
        return { ok: true, status: 200, body: { data: [{ id: 'ad1', creative: { link_data: { call_to_action: { value: { lead_gen_form_id: 'form1' } } } } }] } };
      }
      if (/\/mc5\/ads/.test(url)) {
        return { ok: true, status: 200, body: { data: [{ id: 'ad5', creative: { object_story_spec: { link_data: { call_to_action: { value: { lead_gen_form_id: 'form5' } } } } } }] } };
      }
      if (/\/mc2\/ads/.test(url)) {
        // criativo SEM form (apenas link externo) → confirmado sem formulário
        return { ok: true, status: 200, body: { data: [{ id: 'ad2', creative: { link_data: { call_to_action: { value: { link: 'https://exemplo.com' } } } } }] } };
      }
      if (/\/mc3\/ads/.test(url)) {
        // erro de Graph (ex.: token sem acesso ao ad) → não derruba, mantém a campanha
        return { ok: false, status: 400, body: { error: { code: 100, message: 'Invalid parameter' } } };
      }
      return { ok: true, status: 200, body: { data: [] } };
    });

    const result = await service.getLeadCampaigns({ tenantId: TENANT_ID });

    // mc1 (ativa c/ form), mc5 (pausada c/ form) e mc3 (erro → best-effort incluída)
    expect(result.map((c) => c.id)).toEqual(['mc1', 'mc5', 'mc3']);
    // mc2 (sem form confirmado) e mc4 (tráfego) ficam de fora
    expect(result.some((c) => c.id === 'mc2')).toBe(false);
    expect(result.some((c) => c.id === 'mc4')).toBe(false);
  });

  it('não lança erro quando a detecção de form falha para TODAS as campanhas (listagem nunca quebra)', async () => {
    const service = makeService();

    mockFetch((url) => {
      if (/\/act_123\/campaigns/.test(url)) {
        return { ok: true, status: 200, body: { data: [{ id: 'mc1', name: 'Form', objective: 'OUTCOME_LEADS', status: 'ACTIVE' }] } };
      }
      // Qualquer /ads responde erro (simula query inválida / falta de permissão)
      return { ok: false, status: 400, body: { error: { code: 100, message: 'Invalid parameter' } } };
    });

    const result = await service.getLeadCampaigns({ tenantId: TENANT_ID });

    // Best-effort: não esconde a campanha e não lança 500
    expect(result).toEqual([{ id: 'mc1', name: 'Form' }]);
  });

  it('propaga 403 quando não há conexão Meta', async () => {
    const repo = new MockCampaignRepository(); // sem conexão
    const deps = { decryptMetaToken: (t: string) => `${t}_d`, invalidateCampaignsCache: async () => {}, getMetaLocationsCache: async () => null as any, setMetaLocationsCache: async () => {}, getResolvedTenantAssetSelection: async () => ({ pages: [] }) } as any;
    const service = new CampaignsService(new DefaultMetaCampaignProvider(), repo, deps);

    await expect(service.getLeadCampaigns({ tenantId: TENANT_ID }))
      .rejects.toMatchObject({ code: 'META_CONNECTION_NOT_FOUND' });
  });
});
