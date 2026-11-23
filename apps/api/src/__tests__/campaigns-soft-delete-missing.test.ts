/*
 * Funcionalidade: arquivar campanhas removidas na Meta
 * Cenário: a campanha local existe, mas a Meta já não encontra o objeto
 * Dado uma campanha tenant-bound e uma resposta Graph code 100 "does not exist"
 * Quando o serviço arquiva a campanha
 * Então a campanha local fica arquivada e a operação continua idempotente
 */
import { describe, expect, it } from 'vitest';
import { CampaignsService } from '../services/campaigns/campaigns.service.js';
import { MockCampaignRepository } from '../lib/providers/mock-campaign.repository.js';
import { MockMetaCampaignProvider } from '../lib/providers/mock-campaign.provider.js';

function createService(meta: MockMetaCampaignProvider, repo: MockCampaignRepository) {
  return new CampaignsService(meta, repo, {
    decryptMetaToken: (token) => token,
    invalidateCampaignsCache: async () => undefined,
    getMetaLocationsCache: async () => null,
    setMetaLocationsCache: async () => undefined,
    getResolvedTenantAssetSelection: async () => ({ pages: [] }),
  });
}

function metaReject(metaCode: number, message: string) {
  return Object.assign(new Error(message), { metaCode });
}

describe('CampaignsService.softDeleteCampaign', () => {
  it('arquiva localmente quando a campanha já não existe na Meta', async () => {
    const tenantId = 'tenant-1';
    const repo = new MockCampaignRepository();
    const meta = new MockMetaCampaignProvider();
    repo.metaConnections.push({
      id: 'connection-1', tenantId, accessToken: 'token', selectedAdAccountId: 'act-1',
      adAccounts: [{ id: 'act-1' }], selectedPageIds: [], createdAt: new Date(),
    });
    repo.campaigns.push({
      id: 'campaign-1', tenantId, metaCampaignId: 'meta-1', name: 'Campanha removida',
      status: 'active', budget: {}, metrics: {}, lastSyncedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    meta.getCampaign = async () => {
      throw metaReject(100, 'Unsupported get request. Object with ID meta-1 does not exist');
    };

    const result = await createService(meta, repo).softDeleteCampaign({
      tenantId, campaignId: 'campaign-1', userId: 'user-1',
    });

    expect(result.status).toBe('archived');
    expect(repo.campaigns[0]?.status).toBe('archived');
    expect(repo.furyInsights[0]?.suggestionType).toBe('campaign_archived');
    expect(meta.updatedCampaigns.size).toBe(0);
  });

  it('não transforma token expirado em sucesso local', async () => {
    const tenantId = 'tenant-1';
    const repo = new MockCampaignRepository();
    const meta = new MockMetaCampaignProvider();
    repo.metaConnections.push({
      id: 'connection-1', tenantId, accessToken: 'token', selectedAdAccountId: 'act-1',
      adAccounts: [{ id: 'act-1' }], selectedPageIds: [], createdAt: new Date(),
    });
    repo.campaigns.push({
      id: 'campaign-1', tenantId, metaCampaignId: 'meta-1', name: 'Campanha ativa',
      status: 'active', budget: {}, metrics: {}, lastSyncedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    meta.getCampaign = async () => {
      throw metaReject(190, 'Access token expired');
    };

    await expect(createService(meta, repo).softDeleteCampaign({
      tenantId, campaignId: 'campaign-1', userId: 'user-1',
    })).rejects.toMatchObject({ statusCode: 401, code: 'META_TOKEN_EXPIRED' });
    expect(repo.campaigns[0]?.status).toBe('active');
  });
});
