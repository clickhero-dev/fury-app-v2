import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CampaignsService, normalizeCampaignPanelMetrics, formatCampaignListItem, calculateDateRange, mapWizardMetaError, normalizeWizardCreatives } from '../services/campaigns/campaigns.service.js';
import { MockMetaCampaignProvider } from '../lib/providers/mock-campaign.provider.js';
import { MockCampaignRepository } from '../lib/providers/mock-campaign.repository.js';
import { AppError } from '../middleware/errorHandler.js';

// ponytail: mock mínimo para o dynamic import de @fury/db no slug da LP
vi.mock('@fury/db', () => ({
  db: { query: { tenants: { findFirst: vi.fn() } } },
  tenants: {},
  eq: vi.fn(),
}));

function makeService(overrides: Partial<{
  decryptMetaToken: (token: string) => string;
  invalidateCampaignsCache: () => Promise<void>;
  getMetaLocationsCache: () => Promise<any>;
  setMetaLocationsCache: () => Promise<void>;
  getResolvedTenantAssetSelection: () => Promise<{ pages: Array<{ instagramUserId?: string; pageId?: string }> }>;
}> = {}) {
  const meta = new MockMetaCampaignProvider();
  const repo = new MockCampaignRepository();
  const deps = {
    decryptMetaToken: (token: string) => `${token}_decrypted`,
    invalidateCampaignsCache: async () => {},
    getMetaLocationsCache: async () => null as any,
    setMetaLocationsCache: async () => {},
    getResolvedTenantAssetSelection: async () => ({ pages: [] }),
    ...overrides,
  } as any;
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
    expect(result.campaign_name).toBe('Oferta');
    expect(repo.campaigns).toHaveLength(1);
    expect(repo.campaigns[0].name).toBe('Oferta');
    expect(meta.createdCampaigns).toHaveLength(1);
    expect(meta.createdCampaigns[0].name).toBe('Oferta');
    expect(meta.createdAdSets).toHaveLength(1);
    expect(meta.createdAdCreatives).toHaveLength(1);
    expect(meta.createdAds).toHaveLength(1);
  });

  const wizardArgs = {
    tenantId: TENANT_ID, objective: 'visits' as const,
    headline: 'Oferta', primaryText: 'Imperdivel',
    locationCity: 'Sao Paulo', locationRadiusKm: 30,
    ageMin: 18, ageMax: 65, gender: 'all' as const, dailyBudgetBrl: 100,
    destinationUrl: 'https://example.com',
    creativeUploadUrl: 'https://example.com/img.jpg',
  };

  it('limpeza total: falha no ad deleta adset, adcreative e campaign no Meta', async () => {
    const { service, meta, repo } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
      createdAt: new Date(),
    } as any);
    meta.locationsResult = [{ key: 'city_key_1' }];
    meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };
    meta.uploadAdImageResult = 'img_hash';
    meta.failCreateStep = 'ad';

    await expect(service.createCampaignFromWizard(wizardArgs)).rejects.toThrow(AppError);

    // ad não chegou a ser criado — nada a deletar
    expect(meta.deletedAds).toEqual([]);
    expect(meta.deletedAdSets).toEqual(['meta_adset_1']);
    expect(meta.deletedAdCreatives).toEqual(['meta_creative_1']);
    expect(meta.deletedCampaigns).toEqual(['meta_campaign_1']);
    // nenhum registro local foi criado
    expect(repo.campaigns).toHaveLength(0);
  });

  it('falha no adset deleta apenas a campaign no Meta', async () => {
    const { service, meta, repo } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
      createdAt: new Date(),
    } as any);
    meta.locationsResult = [{ key: 'city_key_1' }];
    meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };
    meta.uploadAdImageResult = 'img_hash';
    meta.failCreateStep = 'adset';

    await expect(service.createCampaignFromWizard(wizardArgs)).rejects.toThrow(AppError);

    expect(meta.deletedCampaigns).toEqual(['meta_campaign_1']);
    expect(meta.deletedAdSets).toEqual([]);
    expect(meta.deletedAdCreatives).toEqual([]);
    expect(meta.deletedAds).toEqual([]);
    expect(repo.campaigns).toHaveLength(0);
  });

  it('falha na criação do registro no banco reverte todos os objetos do Meta', async () => {
    const { service, meta, repo } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
      createdAt: new Date(),
    } as any);
    meta.locationsResult = [{ key: 'city_key_1' }];
    meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };
    meta.uploadAdImageResult = 'img_hash';
    repo.failCreateCampaign = true;

    await expect(service.createCampaignFromWizard(wizardArgs)).rejects.toThrow('DB insert fail');

    expect(meta.deletedAds).toEqual(['meta_ad_1']);
    expect(meta.deletedAdSets).toEqual(['meta_adset_1']);
    expect(meta.deletedAdCreatives).toEqual(['meta_creative_1']);
    expect(meta.deletedCampaigns).toEqual(['meta_campaign_1']);
    expect(repo.campaigns).toHaveLength(0);
  });

  it('falha ao invalidar cache remove o registro local e reverte o Meta', async () => {
    const { service, meta, repo } = makeService({
      invalidateCampaignsCache: async () => { throw new Error('cache fail'); },
    });
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
      createdAt: new Date(),
    } as any);
    meta.locationsResult = [{ key: 'city_key_1' }];
    meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };
    meta.uploadAdImageResult = 'img_hash';

    await expect(service.createCampaignFromWizard(wizardArgs)).rejects.toThrow('cache fail');

    expect(meta.deletedAds).toEqual(['meta_ad_1']);
    expect(meta.deletedAdSets).toEqual(['meta_adset_1']);
    expect(meta.deletedAdCreatives).toEqual(['meta_creative_1']);
    expect(meta.deletedCampaigns).toEqual(['meta_campaign_1']);
    // registro local foi removido pelo rollback
    expect(repo.campaigns).toHaveLength(0);
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

  it('cria whatsapp_conv com link da LP em app.useady.com.br/l/<slug> e OUTCOME_TRAFFIC', async () => {
    const { service, repo, meta } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
      createdAt: new Date(),
    } as any);
    meta.locationsResult = [{ key: 'city_key_1' }];
    meta.uploadAdImageResult = 'img_hash';
    meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };

    const result = await service.createCampaignFromWizard({
      tenantId: TENANT_ID, objective: 'whatsapp_conv',
      headline: 'Fale conosco', primaryText: 'Clique e converse',
      locationCity: 'Sao Paulo', locationRadiusKm: 30,
      ageMin: 18, ageMax: 65, gender: 'all', dailyBudgetBrl: 100,
      creativeUploadUrl: 'https://example.com/img.jpg',
    });

    expect(result.success).toBe(true);
    expect(meta.createdCampaigns[0].objective).toBe('OUTCOME_TRAFFIC');
    expect(meta.createdAdSets[0].optimization_goal).toBe('LINK_CLICKS');
    const link = meta.createdAdCreatives[0].object_story_spec.link_data.link;
    expect(link).toBe(`https://app.useady.com.br/l/${TENANT_ID}`);
    expect(link).not.toContain('/api/lp/');
    expect(meta.createdAdCreatives[0].object_story_spec.link_data.call_to_action.type).toBe('LEARN_MORE');
    expect(repo.campaigns).toHaveLength(1);
  });

  it('whatsapp_conv usa o NOME DA ORGANIZAÇÃO (slugified) no link da LP, não o slug do tenant', async () => {
    const mockDb = await import('@fury/db');
    (mockDb.db.query.tenants.findFirst as any).mockResolvedValue({ name: 'Meu Negócio Test', slug: 'slug-antigo' });

    const { service, repo, meta } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
      createdAt: new Date(),
    } as any);
    meta.locationsResult = [{ key: 'city_key_1' }];
    meta.uploadAdImageResult = 'img_hash';
    meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };

    const result = await service.createCampaignFromWizard({
      tenantId: TENANT_ID, objective: 'whatsapp_conv',
      headline: 'Fale conosco', primaryText: 'Clique e converse',
      locationCity: 'Sao Paulo', locationRadiusKm: 30,
      ageMin: 18, ageMax: 65, gender: 'all', dailyBudgetBrl: 100,
      creativeUploadUrl: 'https://example.com/img.jpg',
    });

    const link = meta.createdAdCreatives[0].object_story_spec.link_data.link;
    expect(link).toBe('https://app.useady.com.br/l/meu-negocio-test');
    expect(link).not.toContain('slug-antigo');
    expect(link).not.toContain(TENANT_ID);
    expect(result.success).toBe(true);
  });

  it('whatsapp_conv cai no slug do tenant quando o nome da organização não está disponível', async () => {
    const mockDb = await import('@fury/db');
    (mockDb.db.query.tenants.findFirst as any).mockResolvedValue({ slug: 'meu-negocio-test' });

    const { service, repo, meta } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
      createdAt: new Date(),
    } as any);
    meta.locationsResult = [{ key: 'city_key_1' }];
    meta.uploadAdImageResult = 'img_hash';
    meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };

    const result = await service.createCampaignFromWizard({
      tenantId: TENANT_ID, objective: 'whatsapp_conv',
      headline: 'Fale conosco', primaryText: 'Clique e converse',
      locationCity: 'Sao Paulo', locationRadiusKm: 30,
      ageMin: 18, ageMax: 65, gender: 'all', dailyBudgetBrl: 100,
      creativeUploadUrl: 'https://example.com/img.jpg',
    });

    const link = meta.createdAdCreatives[0].object_story_spec.link_data.link;
    expect(link).toBe('https://app.useady.com.br/l/meu-negocio-test');
    expect(link).not.toContain(TENANT_ID);
    expect(result.success).toBe(true);
  });

  it('cria 2 ads (1 por criativo) via creatives[], budget em arrays + legado = 1º criativo', async () => {
    const { service, repo, meta } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
      createdAt: new Date(),
    } as any);
    meta.locationsResult = [{ key: 'city_key_1' }];
    meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };
    meta.uploadAdImageResult = 'img_hash';
    const downloadSpy = vi.spyOn(meta, 'downloadImage');

    const result = await service.createCampaignFromWizard({
      tenantId: TENANT_ID, objective: 'visits',
      headline: 'Legacy ignored', primaryText: 'Legacy ignored',
      locationCity: 'Sao Paulo', locationRadiusKm: 30,
      ageMin: 18, ageMax: 65, gender: 'all', dailyBudgetBrl: 100,
      destinationUrl: 'https://example.com',
      creatives: [
        { creativeUploadUrl: 'https://example.com/a.jpg', headline: 'T1', primaryText: 'P1', destinationUrl: 'https://example.com/promo-a' },
        { creativeUploadUrl: 'https://example.com/b.jpg', headline: 'T2', primaryText: 'P2', destinationUrl: 'https://example.com/promo-b' },
      ],
    });

    expect(result.success).toBe(true);
    // nome da campanha = headline do 1º criativo
    expect(result.campaign_name).toBe('T1');
    expect(meta.createdCampaigns).toHaveLength(1);
    expect(meta.createdCampaigns[0].name).toBe('T1');
    // 1 adset único compartilhado
    expect(meta.createdAdSets).toHaveLength(1);
    // N adcreatives + N ads com nomes distintos
    expect(meta.createdAdCreatives).toHaveLength(2);
    expect(meta.createdAdCreatives[0].name).toBe('Creative — FURY #1');
    expect(meta.createdAdCreatives[1].name).toBe('Creative — FURY #2');
    expect(meta.createdAds).toHaveLength(2);
    expect(meta.createdAds[0].name).toContain(' #1');
    expect(meta.createdAds[1].name).toContain(' #2');
    expect(meta.createdAds[0].name).not.toBe(meta.createdAds[1].name);
    // imagem de cada criativo é resolvida e baixada
    expect(downloadSpy).toHaveBeenCalledTimes(2);
    expect(downloadSpy).toHaveBeenCalledWith('https://example.com/a.jpg', expect.anything());
    expect(downloadSpy).toHaveBeenCalledWith('https://example.com/b.jpg', expect.anything());
    // destinationUrl próprio de cada criativo no link do anúncio
    expect(meta.createdAdCreatives[0].object_story_spec.link_data.link).toBe('https://example.com/promo-a');
    expect(meta.createdAdCreatives[1].object_story_spec.link_data.link).toBe('https://example.com/promo-b');
    // budget: arrays completos + campos legados = 1º criativo
    expect(repo.campaigns).toHaveLength(1);
    const budget = repo.campaigns[0].budget as Record<string, unknown>;
    expect(budget.ad_creative_ids).toEqual(['meta_creative_1', 'meta_creative_2']);
    expect(budget.ad_ids).toEqual(['meta_ad_1', 'meta_ad_2']);
    expect(budget.creative_image_urls).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
    expect(budget.creative_asset_ids).toEqual([]);
    expect(budget.ad_creative_id).toBe('meta_creative_1');
    expect(budget.ad_id).toBe('meta_ad_1');
    expect(budget.creative_image_url).toBe('https://example.com/a.jpg');
    expect(budget.creative_asset_id).toBe(null);
    expect(budget.creative_headline).toBe('T1');
    expect(budget.creative_primary_text).toBe('P1');
  });

  it('rollback multi: falha no 2º ad deleta ads/adcreatives criados (reverso), adset e campaign — sem registro local', async () => {
    const { service, meta, repo } = makeService();
    repo.metaConnections.push({
      tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
      adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
      createdAt: new Date(),
    } as any);
    meta.locationsResult = [{ key: 'city_key_1' }];
    meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };
    meta.uploadAdImageResult = 'img_hash';

    // o mock só sabe falhar no 1º ad — aqui falhamos no 2º (criativo 2)
    let adCalls = 0;
    const originalCreateAd = meta.createAd.bind(meta);
    meta.createAd = async (adAccountId: string, accessToken: string, body: any) => {
      adCalls += 1;
      if (adCalls === 2) throw new Error('Ad 2 fail');
      return originalCreateAd(adAccountId, accessToken, body);
    };

    await expect(service.createCampaignFromWizard({
      tenantId: TENANT_ID, objective: 'visits',
      headline: 'Legacy', primaryText: 'Legacy',
      locationCity: 'Sao Paulo', locationRadiusKm: 30,
      ageMin: 18, ageMax: 65, gender: 'all', dailyBudgetBrl: 100,
      creatives: [
        { creativeUploadUrl: 'https://example.com/a.jpg', headline: 'T1', primaryText: 'P1' },
        { creativeUploadUrl: 'https://example.com/b.jpg', headline: 'T2', primaryText: 'P2' },
      ],
    })).rejects.toThrow(AppError);

    // o 2º ad nunca existiu (createAd lançou antes de retornar o id) — só o 1º é deletado
    expect(meta.deletedAds).toEqual(['meta_ad_1']);
    // os 2 adcreatives são deletados em ORDEM REVERSA
    expect(meta.deletedAdCreatives).toEqual(['meta_creative_2', 'meta_creative_1']);
    expect(meta.deletedAdSets).toEqual(['meta_adset_1']);
    expect(meta.deletedCampaigns).toEqual(['meta_campaign_1']);
    // createCampaign (registro local) NÃO foi chamado
    expect(repo.campaigns).toHaveLength(0);
  });

  describe('normalizeWizardCreatives (pura)', () => {
    it('legado single (uploadUrl + headline/primaryText) vira array de 1', () => {
      const r = normalizeWizardCreatives({
        creativeUploadUrl: 'https://example.com/a.jpg',
        headline: 'T1', primaryText: 'P1',
        destinationUrl: 'https://example.com/lp',
      });
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({
        creativeUploadUrl: 'https://example.com/a.jpg',
        headline: 'T1', primaryText: 'P1',
        destinationUrl: 'https://example.com/lp',
      });
    });

    it('creatives arg vence quando presente (legado ignorado)', () => {
      const r = normalizeWizardCreatives({
        creatives: [
          { creativeUploadUrl: 'https://example.com/b.jpg', headline: 'T2', primaryText: 'P2' },
          { creativeAssetId: 'asset-1', headline: 'T3', primaryText: 'P3' },
        ],
        creativeUploadUrl: 'https://example.com/a.jpg',
        headline: 'T1', primaryText: 'P1',
      });
      expect(r).toHaveLength(2);
      expect(r[0].headline).toBe('T2');
      expect(r[0].creativeUploadUrl).toBe('https://example.com/b.jpg');
      expect(r[1].creativeAssetId).toBe('asset-1');
      expect(r[1].headline).toBe('T3');
    });
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
