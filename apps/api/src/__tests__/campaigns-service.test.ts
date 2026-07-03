import { describe, it, expect, beforeEach } from 'vitest';
import { CampaignsService, normalizeCampaignPanelMetrics, formatCampaignListItem, calculateDateRange, mapWizardMetaError } from '../services/campaigns.service.js';
import { MockMetaCampaignProvider } from '../lib/providers/mock-campaign.provider.js';
import { MockCampaignRepository } from '../lib/providers/mock-campaign.repository.js';
import { AppError } from '../middleware/errorHandler.js';

function makeService() {
  const meta = new MockMetaCampaignProvider();
  const repo = new MockCampaignRepository();
  const deps = {
    decryptMetaToken: (token: string) => `${token}_decrypted`,
    invalidateCampaignsCache: async () => {},
    getMetaLocationsCache: async () => null as any,
    setMetaLocationsCache: async () => {},
    getResolvedTenantAssetSelection: async () => ({ pages: [] }),
  };
  const service = new CampaignsService(meta, repo, deps);
  return { service, meta, repo };
}

const TENANT_ID = 'tenant-1';

// ── Pure functions ──────────────────────────────────────────────────────────

describe('normalizeCampaignPanelMetrics', () => {
  it('retorna zeros para null/undefined', () => {
    const m = normalizeCampaignPanelMetrics(null);
    expect(m.spend).toBe(0);
    expect(m.roas).toBe(0);
  });

  it('parse números do objeto', () => {
    const m = normalizeCampaignPanelMetrics({ spend: 100.5, roas: 3.2, ctr: '2.5' });
    expect(m.spend).toBe(100.5);
    expect(m.roas).toBe(3.2);
    expect(m.ctr).toBe(2.5);
  });
});

describe('formatCampaignListItem', () => {
  it('formata corretamente', () => {
    const campaign: any = {
      id: '1', name: 'Test', status: 'active',
      budget: { objective: 'OUTCOME_TRAFFIC' },
      metrics: { spend: 100, impressions: 1000, clicks: 50, ctr: 5, cpc: 2, roas: 3.5, cpa: 10, conversions: 10 },
      createdAt: new Date(),
    };
    const item = formatCampaignListItem(campaign);
    expect(item.name).toBe('Test');
    expect(item.objective).toBe('OUTCOME_TRAFFIC');
    expect(item.spend).toBe(100);
    expect(item.roas).toBe(3.5);
  });
});

describe('calculateDateRange', () => {
  it('calcula last_7d', () => {
    const r = calculateDateRange('last_7d');
    expect(r.startDate).toBeDefined();
    expect(r.endDate).toBeDefined();
  });

  it('usa datas customizadas', () => {
    const r = calculateDateRange('custom', '2026-01-01', '2026-01-31');
    expect(r.startDate).toBe('2026-01-01');
    expect(r.endDate).toBe('2026-01-31');
  });
});

describe('mapWizardMetaError', () => {
  it('erro 190 → META_TOKEN_EXPIRED', () => {
    expect(() => mapWizardMetaError({ metaCode: 190, message: 'expired' }, 'campaign'))
      .toThrowError(AppError);
  });

  it('OAuthException 200 → META_PERMISSION_DENIED', () => {
    expect(() => mapWizardMetaError({ metaCode: 200, metaType: 'OAuthException' }, 'adset'))
      .toThrowError(AppError);
  });

  it('subcode 3858258 → META_IMAGE_DOWNLOAD_FAILED', () => {
    expect(() => mapWizardMetaError({ metaSubcode: 3858258 }, 'creative'))
      .toThrowError(AppError);
  });

  it('mensagem insufficient → META_INSUFFICIENT_FUNDS', () => {
    expect(() => mapWizardMetaError({ message: 'insufficient balance' }, 'ad'))
      .toThrowError(AppError);
  });
});

// ── Service: createCampaign ────────────────────────────────────────────────

describe('CampaignsService.createCampaign', () => {
  it('cria campanha com sucesso', async () => {
    const { service, repo, meta } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [{ id: 'act_123' }], accessToken: 'tok', selectedPageIds: [],
      createdAt: new Date(),
    } as any);

    const result = await service.createCampaign({
      tenantId: TENANT_ID, name: 'Test', objective: 'OUTCOME_SALES',
      dailyBudget: 1000, adAccountId: 'act_123',
    });

    expect(result).toBeDefined();
    expect(result.metaCampaignId).toBe('meta_campaign_1');
    expect(repo.campaigns).toHaveLength(1);
  });

  it('rejeita adAccount de outro tenant', async () => {
    const { service, repo } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [{ id: 'act_999' }], accessToken: 'tok', selectedPageIds: [],
      createdAt: new Date(),
    } as any);

    await expect(service.createCampaign({
      tenantId: TENANT_ID, name: 'Test', objective: 'OUTCOME_SALES',
      dailyBudget: 1000, adAccountId: 'act_123',
    })).rejects.toThrow(AppError);
  });

  it('rejeita sem conexao Meta', async () => {
    const { service } = makeService();
    await expect(service.createCampaign({
      tenantId: TENANT_ID, name: 'Test', objective: 'OUTCOME_SALES',
      dailyBudget: 1000, adAccountId: 'act_123',
    })).rejects.toThrow(AppError);
  });
});

// ── Service: pauseCampaign / resumeCampaign ─────────────────────────────────

describe('CampaignsService.pauseCampaign & resumeCampaign', () => {
  it('pausa e resume campanha', async () => {
    const { service, repo } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [{ id: 'act_123' }], accessToken: 'tok', selectedPageIds: [],
      createdAt: new Date(),
    } as any);

    const paused = await service.pauseCampaign({ tenantId: TENANT_ID, campaignId: 'meta_camp_1' });
    expect(paused.status).toBe('PAUSED');

    const resumed = await service.resumeCampaign({ tenantId: TENANT_ID, campaignId: 'meta_camp_1' });
    expect(resumed.status).toBe('ACTIVE');
  });
});

// ── Service: getCampaign / getCampaigns ─────────────────────────────────────

describe('CampaignsService.getCampaign & getCampaigns', () => {
  it('retorna campanha por id', async () => {
    const { service, repo } = makeService();
    const created = await repo.createCampaign({ tenantId: TENANT_ID } as any);

    const c = await service.getCampaign({ tenantId: TENANT_ID, campaignId: created.id });
    expect(c.id).toBe(created.id);
  });

  it('lanca 404 se nao encontrada', async () => {
    const { service } = makeService();
    await expect(service.getCampaign({ tenantId: TENANT_ID, campaignId: 'nonexistent' })).rejects.toThrow(AppError);
  });

  it('lista campanhas paginadas', async () => {
    const { service, repo } = makeService();
    await repo.createCampaign({ tenantId: TENANT_ID } as any);
    await repo.createCampaign({ tenantId: TENANT_ID } as any);

    const result = await service.getCampaigns({ tenantId: TENANT_ID, limit: 10, offset: 0 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});

// ── Service: updateCampaignStatus / softDeleteCampaign ──────────────────────

describe('CampaignsService.updateCampaignStatus & softDeleteCampaign', () => {
  it('altera status com log', async () => {
    const { service, repo } = makeService();
    repo.metaConnections.push({ tenantId: TENANT_ID, accessToken: 'tok' } as any);
    const c = await repo.createCampaign({ tenantId: TENANT_ID, metaCampaignId: 'mc1', name: 'Test' } as any);

    const updated = await service.updateCampaignStatus({ tenantId: TENANT_ID, campaignId: c.id, status: 'PAUSED', userId: 'u1' });
    expect(updated.status).toBe('paused');
    expect(repo.furyInsights).toHaveLength(1);
    expect(repo.furyInsights[0].suggestionType).toBe('campaign_status_paused');
  });

  it('softDelete arquiva campanha', async () => {
    const { service, repo } = makeService();
    repo.metaConnections.push({ tenantId: TENANT_ID, accessToken: 'tok' } as any);
    const c = await repo.createCampaign({ tenantId: TENANT_ID, metaCampaignId: 'mc1' } as any);

    const deleted = await service.softDeleteCampaign({ tenantId: TENANT_ID, campaignId: c.id, userId: 'u1' });
    expect(deleted.status).toBe('archived');
    expect(repo.furyInsights).toHaveLength(1);
    expect(repo.furyInsights[0].suggestionType).toBe('campaign_archived');
  });
});

// ── Service: updateCampaignBudget ──────────────────────────────────────────

describe('CampaignsService.updateCampaignBudget', () => {
  it('atualiza orcamento', async () => {
    const { service, repo } = makeService();
    repo.metaConnections.push({ tenantId: TENANT_ID, accessToken: 'tok' } as any);
    const c = await repo.createCampaign({ tenantId: TENANT_ID, metaCampaignId: 'mc1', budget: { daily_budget: 500 } } as any);

    const updated = await service.updateCampaignBudget({ tenantId: TENANT_ID, campaignId: c.id, dailyBudget: 1000 });
    expect((updated.budget as any).daily_budget).toBe(1000);
  });
});

// ── Service: updateCampaign ─────────────────────────────────────────────────

describe('CampaignsService.updateCampaign', () => {
  it('atualiza nome', async () => {
    const { service, repo } = makeService();
    repo.metaConnections.push({ tenantId: TENANT_ID, accessToken: 'tok' } as any);
    const c = await repo.createCampaign({ tenantId: TENANT_ID, metaCampaignId: 'mc1', name: 'Old' } as any);

    const updated = await service.updateCampaign({ tenantId: TENANT_ID, campaignId: c.id, name: 'New' });
    expect(updated.name).toBe('New');
  });
});

// ── Service: createCampaignFromWizard ───────────────────────────────────────

describe('CampaignsService.createCampaignFromWizard', () => {
  it('cria campanha wizard completa', async () => {
    const { service, repo, meta } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
      createdAt: new Date(),
    } as any);
    meta.locationsResult = [{ key: 'city_key_1' }];
    meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };
    meta.uploadAdImageResult = 'img_hash';

    const result = await service.createCampaignFromWizard({
      tenantId: TENANT_ID, objective: 'visits',
      headline: 'Oferta', primaryText: 'Imperdivel',
      locationCity: 'Sao Paulo', locationRadiusKm: 30,
      ageMin: 18, ageMax: 65, gender: 'all', dailyBudgetBrl: 100,
      destinationUrl: 'https://example.com',
      creativeUploadUrl: 'https://example.com/img.jpg',
    });

    expect(result.success).toBe(true);
    expect(result.meta_campaign_id).toBe('meta_campaign_1');
    expect(repo.campaigns).toHaveLength(1);
    expect(meta.createdCampaigns).toHaveLength(1);
    expect(meta.createdAdSets).toHaveLength(1);
    expect(meta.createdAdCreatives).toHaveLength(1);
    expect(meta.createdAds).toHaveLength(1);
  });

  it('rejeita whatsapp sem phone number', async () => {
    const { service, repo } = makeService();
    repo.metaConnections.push({ tenantId: TENANT_ID, selectedAdAccountId: 'act_123', accessToken: 'tok', selectedPageIds: ['page_1'] } as any);

    await expect(service.createCampaignFromWizard({
      tenantId: TENANT_ID, objective: 'whatsapp',
      headline: 'Oferta', primaryText: 'Teste',
      locationCity: 'SP', locationRadiusKm: 10,
      ageMin: 18, ageMax: 65, gender: 'all', dailyBudgetBrl: 50,
      whatsappPageId: 'page_1',
    })).rejects.toThrow(AppError);
  });

  it('rejeita sem conexao Meta', async () => {
    const { service } = makeService();
    await expect(service.createCampaignFromWizard({
      tenantId: TENANT_ID, objective: 'visits',
      headline: 'Test', primaryText: 'Test',
      locationCity: 'SP', locationRadiusKm: 10,
      ageMin: 18, ageMax: 65, gender: 'all', dailyBudgetBrl: 50,
    })).rejects.toThrow(AppError);
  });
});

// ── Service: getCampaignPanelDetail ─────────────────────────────────────────

describe('CampaignsService.getCampaignPanelDetail', () => {
  it('retorna detalhes com metrics e takedowns', async () => {
    const { service, repo } = makeService();
    const c = await repo.createCampaign({
      tenantId: TENANT_ID, metaCampaignId: 'mc1', name: 'Test',
      status: 'active', budget: { objective: 'OUTCOME_TRAFFIC' },
      metrics: { spend: 100, roas: 2.5, ctr: 3, cpm: 15, conversions: 10, cpa: 10, impressions: 1000 },
    } as any);

    repo.furyInsights.push({
      tenantId: TENANT_ID, campaignId: c.id, suggestionType: 'smart_takedown',
      suggestionData: { reason: 'low_roas' }, createdAt: new Date(),
      id: 'fi1', appliedAt: null,
    } as any);

    const detail = await service.getCampaignPanelDetail({ tenantId: TENANT_ID, campaignId: c.id });
    expect(detail).not.toBeNull();
    expect(detail!.campaign.name).toBe('Test');
    expect(detail!.campaign.objective).toBe('OUTCOME_TRAFFIC');
    expect(detail!.campaign.metrics.roas).toBe(2.5);
    expect(detail!.recentTakedowns).toHaveLength(1);
  });

  it('retorna null se nao encontrada', async () => {
    const { service } = makeService();
    const detail = await service.getCampaignPanelDetail({ tenantId: TENANT_ID, campaignId: 'nonexistent' });
    expect(detail).toBeNull();
  });
});

// ── Service: getCampaignInsights ────────────────────────────────────────────

describe('CampaignsService.getCampaignInsights', () => {
  it('retorna timeseries do Meta', async () => {
    const { service, repo, meta } = makeService();
    repo.metaConnections.push({ tenantId: TENANT_ID, accessToken: 'tok' } as any);
    await repo.createCampaign({
      tenantId: TENANT_ID, metaCampaignId: 'mc1', name: 'Test',
      status: 'active', budget: { objective: 'OUTCOME_TRAFFIC' },
    } as any);

    meta.insightsResult = {
      data: [
        { date_start: '2026-01-01', spend: '100', impressions: '500', clicks: '25', ctr: '5', cpc: '4', cpm: '200', actions: [], purchase_roas: [] },
      ],
    };

    const result = await service.getCampaignInsights({
      tenantId: TENANT_ID, campaignId: 'mc1',
      dateRange: 'last_7d',
    });

    expect(result.campaign.name).toBe('Test');
    expect(result.timeseries).toHaveLength(1);
    expect(result.timeseries[0].spend).toBe(100);
  });
});

// ── Service: searchMetaLocations ────────────────────────────────────────────

describe('CampaignsService.searchMetaLocations', () => {
  it('busca e cacheia localizacoes', async () => {
    const { service, repo, meta } = makeService();
    repo.metaConnections.push({ tenantId: TENANT_ID, accessToken: 'tok' } as any);
    meta.locationsResult = [{ key: 'sp_key', name: 'Sao Paulo' }];

    const results = await service.searchMetaLocations({ tenantId: TENANT_ID, query: 'Sao Paulo' });
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('sp_key');
  });
});
