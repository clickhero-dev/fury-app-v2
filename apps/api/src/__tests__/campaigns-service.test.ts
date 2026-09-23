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

/** Cria um erro META no formato real do metaApiCall: Error simples com metaCode anexado (NÃO AppError). */
function metaError(metaCode: number, message: string, extra: Record<string, unknown> = {}) {
  const err = new Error(message) as Error & { metaCode: number; [k: string]: unknown };
  err.metaCode = metaCode;
  Object.assign(err, extra);
  return err;
}

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

  it('OAuthException 200 no lead_form → mensagem aponta pages_manage_ads', () => {
    try {
      mapWizardMetaError({ metaCode: 200, metaType: 'OAuthException' }, 'lead_form');
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('META_PERMISSION_DENIED');
      // Doc Lead Ads: criar leadgen_forms exige pages_manage_ads (não pages_manage_metadata).
      expect(appErr.message).toContain('pages_manage_ads');
      expect(appErr.message).toContain('Formulário');
    }
  });

  it('OAuthException 200 no lead_form preserva a mensagem real do Meta (metaUserMsg) para diagnóstico', () => {
    // O Meta pode recusar o leadgen_forms por uma causa que NÃO é o scope do token
    // (ex.: a pessoa não tem a task ADVERTISE na Página selecionada). Nesse caso a
    // mensagem real do Meta deve chegar ao usuário, não ser substituída por texto genérico.
    try {
      mapWizardMetaError(
        {
          metaCode: 200,
          metaType: 'OAuthException',
          metaUserMsg: 'The user is not an admin of the page and cannot create lead forms.',
          metaUserTitle: '(#200)',
        },
        'lead_form'
      );
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('META_PERMISSION_DENIED');
      expect(appErr.message).toContain('not an admin of the page');
    }
  });

  it('subcode 3858258 → META_IMAGE_DOWNLOAD_FAILED', () => {
    expect(() => mapWizardMetaError({ metaSubcode: 3858258 }, 'creative'))
      .toThrowError(AppError);
  });

  it('subcode 1892075 (legal content missing) → META_LEGAL_CONTENT_REQUIRED', () => {
    try {
      mapWizardMetaError({ metaSubcode: 1892075, metaCode: 100, metaType: 'OAuthException' }, 'lead_form');
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('META_LEGAL_CONTENT_REQUIRED');
      expect(appErr.message).toContain('política de privacidade');
    }
  });

  it('subcode 2061015 (link field required) → META_LINK_REQUIRED', () => {
    try {
      mapWizardMetaError({ metaSubcode: 2061015, metaCode: 100, metaType: 'OAuthException' }, 'creative');
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('META_LINK_REQUIRED');
    }
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

  it('pause: campanha inexistente no Meta (code 100 + does not exist) → 404 CAMPAIGN_NOT_FOUND (não 500)', async () => {
    const { service, meta, repo } = makeService();
    repo.metaConnections.push({ tenantId: TENANT_ID, accessToken: 'tok' } as any);
    meta.getCampaign = async () => { throw metaError(100, 'Unsupported get request. Object with ID x does not exist'); };

    await expect(service.pauseCampaign({ tenantId: TENANT_ID, campaignId: 'meta_apagada' }))
      .rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND', statusCode: 404 });
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

  it('softDelete bloqueia campanha local de outro tenant (403 FORBIDDEN)', async () => {
    const { service, repo } = makeService();
    repo.metaConnections.push({ tenantId: TENANT_ID, accessToken: 'tok' } as any);
    const otherCampaign = await repo.createCampaign({ tenantId: 'tenant-2', metaCampaignId: 'mc2', name: 'Other' } as any);

    await expect(service.softDeleteCampaign({ tenantId: TENANT_ID, campaignId: otherCampaign.id, userId: 'u1' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(repo.campaigns.find((c) => c.id === otherCampaign.id)?.status).not.toBe('archived');
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

// ── Service: objetivo 'leads' (formulário + WhatsApp no fim) ────────────────

function makeLeadsEnv(meta: MockMetaCampaignProvider, repo: MockCampaignRepository) {
  repo.metaConnections.push({
    tenantId: TENANT_ID, id: 'mc1', selectedAdAccountId: 'act_123',
    adAccounts: [], accessToken: 'tok', selectedPageIds: ['page_1'],
    createdAt: new Date(),
  } as any);
  meta.locationsResult = [{ key: 'city_key_1' }];
  meta.downloadImageResult = { buffer: Buffer.from('fake'), contentType: 'image/jpeg' };
  meta.uploadAdImageResult = 'img_hash';
  meta.leadFormResult = { id: 'form_1' };
}

const leadsArgs = {
  tenantId: TENANT_ID, objective: 'leads' as const,
  headline: 'Promoção', primaryText: 'Cadastre-se',
  locationCity: 'Sao Paulo', locationRadiusKm: 30,
  ageMin: 18, ageMax: 65, gender: 'all' as const, dailyBudgetBrl: 100,
  creativeUploadUrl: 'https://example.com/img.jpg',
  whatsappPageId: 'page_1', whatsappPhoneNumber: '5511999999999',
};

describe('CampaignsService.createCampaignFromWizard — objetivo leads', () => {
  it('cria lead form com nome/email/telefone e botão WhatsApp, adset LEAD_GENERATION e creative SIGN_UP', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);

    const result = await service.createCampaignFromWizard(leadsArgs as any);

    expect(result.success).toBe(true);
    // formulário criado na página com as 3 perguntas
    expect(meta.createdLeadForms).toHaveLength(1);
    const formBody = meta.createdLeadForms[0];
    expect(formBody.page_id).toBe('page_1');
    expect(formBody.body.questions.map((q: any) => q.type)).toEqual(['FULL_NAME', 'EMAIL', 'PHONE']);
    expect(formBody.body.thank_you_page.button_type).toBe('WHATSAPP');
    expect(formBody.body.thank_you_page.business_phone_number).toBe('5511999999999');
    // adset otimizado pra lead generation
    expect(meta.createdAdSets[0].optimization_goal).toBe('LEAD_GENERATION');
    expect(meta.createdAdSets[0].destination_type).toBe('ON_AD');
    expect(meta.createdAdSets[0].promoted_object).toEqual({ page_id: 'page_1' });
    // creative aponta pro formulário
    const creativeSpec = meta.createdAdCreatives[0].object_story_spec;
    expect(creativeSpec.link_data.call_to_action.type).toBe('SIGN_UP');
    expect(creativeSpec.link_data.call_to_action.value).toEqual({ lead_gen_form_id: 'form_1' });
    // Doc Lead Ads: o campo link no link_data é obrigatório e deve ser https://fb.me/
    expect(creativeSpec.link_data.link).toBe('https://fb.me/');
    // persistência local guarda o id do form
    expect(repo.campaigns[0].budget.lead_form_id).toBe('form_1');
    expect(repo.campaigns[0].budget.lead_page_id).toBe('page_1');
  });

  it('envia privacy_policy com URL pública da política de privacidade (nome slugificado)', async () => {
    const mockDb = await import('@fury/db');
    (mockDb.db.query.tenants.findFirst as any).mockResolvedValue({ name: 'Meu Negócio Test', slug: 'slug-antigo' });
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);

    await service.createCampaignFromWizard(leadsArgs as any);

    const privacy = meta.createdLeadForms[0].body.privacy_policy;
    expect(privacy).toBeDefined();
    // Slug derivado do NOME da organização (não do tenants.slug desatualizado)
    expect(privacy.url).toBe('https://app.useady.com.br/privacidade/meu-negocio-test');
    expect(privacy.link_text).toBe('Política de Privacidade');
    (mockDb.db.query.tenants.findFirst as any).mockReset();
  });

  it('privacy_policy cai no tenantId quando o nome da organização não está disponível', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);

    await service.createCampaignFromWizard(leadsArgs as any);

    const privacy = meta.createdLeadForms[0].body.privacy_policy;
    expect(privacy.url).toBe(`https://app.useady.com.br/privacidade/${TENANT_ID}`);
  });

  it('arquiva o formulário no rollback quando a criação do adset falha', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.failCreateStep = 'adset';

    await expect(service.createCampaignFromWizard(leadsArgs as any)).rejects.toThrow(AppError);

    expect(meta.archivedLeadForms).toEqual(['form_1']);
    expect(meta.deletedCampaigns).toEqual(['meta_campaign_1']);
    expect(repo.campaigns).toHaveLength(0);
  });

  it('falha do lead form → step "lead_form" (não "adset") + rollback sem deletar campanha', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    // Simula OAuthException 200 do Meta ao criar o form (falta pages_manage_ads)
    meta.createLeadForm = async () => {
      const err = new Error('(#200) Permission error') as Error & { metaCode: number; metaType: string };
      err.metaCode = 200;
      err.metaType = 'OAuthException';
      throw err;
    };

    try {
      await service.createCampaignFromWizard(leadsArgs as any);
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      const appErr = err as AppError;
      // Erro do FORMULÁRIO nunca deve ser reportado como step 'adset'
      // (que caía na mensagem genérica — branch lead_form do mapeador era morto)
      expect(appErr.code).toBe('META_PERMISSION_DENIED');
      expect(appErr.message).toContain('pages_manage_ads');
      expect(appErr.message).toContain('Formulário');
    }
    // Campanha nem chegou a ser criada no Meta (form vem antes) — nada a rolar back
    expect(meta.createdCampaigns).toHaveLength(0);
    expect(meta.deletedCampaigns).toHaveLength(0);
    expect(repo.campaigns).toHaveLength(0);
  });


  it('rejeita leads sem whatsappPageId', async () => {
    const { service, repo, meta } = makeService();
    makeLeadsEnv(meta, repo);

    await expect(service.createCampaignFromWizard({
      ...leadsArgs, whatsappPageId: undefined,
    } as any)).rejects.toThrow(AppError);
    expect(meta.createdLeadForms).toHaveLength(0);
  });

  it('rejeita leads sem whatsappPhoneNumber (botão WhatsApp do fim do form)', async () => {
    const { service, repo, meta } = makeService();
    makeLeadsEnv(meta, repo);

    await expect(service.createCampaignFromWizard({
      ...leadsArgs, whatsappPhoneNumber: undefined,
    } as any)).rejects.toThrow(AppError);
    expect(meta.createdLeadForms).toHaveLength(0);
  });

  it('normaliza business_phone_number: completa DDI 55 em número nacional (inclui DDD 55 do RS)', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);

    await service.createCampaignFromWizard({
      ...leadsArgs, whatsappPhoneNumber: '55981286344', // (55) 98128-6344 — DDD 55 é RS, não DDI!
    } as any);

    const thankYou = meta.createdLeadForms[0].body.thank_you_page;
    expect(thankYou.business_phone_number).toBe('5555981286344');
  });

  it('não duplica DDI quando o número já veio com DDI (12/13 dígitos)', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);

    await service.createCampaignFromWizard({
      ...leadsArgs, whatsappPhoneNumber: '5511999999999',
    } as any);

    expect(meta.createdLeadForms[0].body.thank_you_page.business_phone_number).toBe('5511999999999');
  });

  it('número nacional de 11 dígitos com DDD comum ganha DDI', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);

    await service.createCampaignFromWizard({
      ...leadsArgs, whatsappPhoneNumber: '11932734241',
    } as any);

    expect(meta.createdLeadForms[0].body.thank_you_page.business_phone_number).toBe('5511932734241');
  });

  // ── Page access token na criação do Formulário (issue #213) ────────────────

  it('usa o Page access token (não o user token) na criação do leadgen_forms', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    // mock default: Página admin com task ADVERTISE → page_token_page_1

    await service.createCampaignFromWizard(leadsArgs as any);

    expect(meta.createdLeadForms).toHaveLength(1);
    expect(meta.createdLeadForms[0].access_token).toBe('page_token_page_1');
    // getPageAccessToken foi consultado com o user token da conexão
    expect(meta.pageAccessRequests).toEqual([{ pageId: 'page_1', userAccessToken: 'tok_decrypted' }]);
  });

  it('funciona com Página acessada via Business Manager (mesmo fluxo /me/accounts)', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.pageAccessByPageId.set('page_1', {
      pageId: 'page_1', name: 'Página BM', accessToken: 'page_token_bm_1', tasks: ['ADVERTISE'],
    });

    await service.createCampaignFromWizard(leadsArgs as any);

    expect(meta.createdLeadForms[0].access_token).toBe('page_token_bm_1');
    expect(meta.createdLeadForms[0].body.name).toBe('Formulário — Promoção');
  });

  it('sem acesso à Página → META_PAGE_NOT_MANAGED e nada criado no Meta', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.pageAccessByPageId.set('page_1', null);

    try {
      await service.createCampaignFromWizard(leadsArgs as any);
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('META_PAGE_NOT_MANAGED');
      expect(appErr.message).toContain('não tem acesso para anunciar nesta Página');
    }
    expect(meta.createdLeadForms).toHaveLength(0);
    expect(meta.createdCampaigns).toHaveLength(0);
    expect(repo.campaigns).toHaveLength(0);
  });

  it('Página sem task ADVERTISE → META_PAGE_ADVERTISE_TASK_REQUIRED e nada criado', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.pageAccessByPageId.set('page_1', {
      pageId: 'page_1', name: 'Página Analyst', accessToken: 'page_token_analyst', tasks: ['ANALYZE'],
    });

    try {
      await service.createCampaignFromWizard(leadsArgs as any);
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe('META_PAGE_ADVERTISE_TASK_REQUIRED');
      expect(appErr.message).toContain('ADVERTISE');
    }
    expect(meta.createdLeadForms).toHaveLength(0);
    expect(meta.createdCampaigns).toHaveLength(0);
    expect(repo.campaigns).toHaveLength(0);
  });

  it('rollback do lead_form arquiva usando o MESMO Page token da criação', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.failCreateStep = 'adset'; // campanha criada, adset falha → rollback do form

    await expect(service.createCampaignFromWizard(leadsArgs as any)).rejects.toThrow(AppError);

    expect(meta.archivedLeadForms).toEqual(['form_1']);
    // O archive usa o MESMO token da criação (Page token), não o user token
    expect(meta.archivedLeadFormsWithToken).toEqual([
      { formId: 'form_1', accessToken: 'page_token_page_1' },
    ]);
  });
});

describe('CampaignsService.getLeadCampaigns (fonte da verdade: Meta)', () => {
  it('retorna campanhas OUTCOME_LEADS da Meta, incluindo as criadas FORA do Fury', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.listCampaignsResult = [
      { id: 'meta_camp_externa', name: 'Externa', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
      { id: 'meta_camp_trafego', name: 'Tráfego', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE' },
      { id: 'meta_camp_pausada', name: 'Pausada', objective: 'OUTCOME_LEADS', status: 'PAUSED' },
    ];

    const result = await service.getLeadCampaigns({ tenantId: TENANT_ID });

    expect(result).toEqual([
      { id: 'meta_camp_externa', name: 'Externa' },
      { id: 'meta_camp_pausada', name: 'Pausada' },
    ]);
    // Usa o ad account selecionado da conexão
    expect(meta.listCampaignsRequests[0].adAccountId).toBe('act_123');
  });

  it('lança 403 sem conexão Meta', async () => {
    const { service } = makeService();
    await expect(service.getLeadCampaigns({ tenantId: TENANT_ID }))
      .rejects.toMatchObject({ code: 'META_CONNECTION_NOT_FOUND' });
  });

  it('mapeia metaCode 190 → META_TOKEN_EXPIRED (401)', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.listCampaigns = async () => { throw metaError(190, 'Access token has expired'); };

    await expect(service.getLeadCampaigns({ tenantId: TENANT_ID }))
      .rejects.toMatchObject({ code: 'META_TOKEN_EXPIRED', statusCode: 401 });
  });

  it('mapeia metaCode 100 → INVALID_PARAMETER (400)', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.listCampaigns = async () => { throw metaError(100, 'Invalid parameter'); };

    await expect(service.getLeadCampaigns({ tenantId: TENANT_ID }))
      .rejects.toMatchObject({ code: 'INVALID_PARAMETER', statusCode: 400 });
  });

  it('mapeia (#200) Permission error (ex.: fallback META_SYSTEM_ACCESS_TOKEN) → META_PERMISSION_DENIED (403)', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.listCampaigns = async () => { throw metaError(200, '(#200) Permission error', { metaType: 'OAuthException' }); };

    await expect(service.getLeadCampaigns({ tenantId: TENANT_ID }))
      .rejects.toMatchObject({ code: 'META_PERMISSION_DENIED', statusCode: 403 });
  });
});

describe('CampaignsService.getCampaignLeads', () => {
  it('retorna leads normalizados (nome/email/telefone) do formulário da campanha', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    repo.campaigns.push({ id: 'campaign_1', tenantId: TENANT_ID, budget: { lead_form_id: 'form_1' } } as any);
    meta.leadsResult = {
      data: [{
        created_time: '2026-09-21T12:00:00Z',
        field_data: [
          { name: 'full_name', values: ['Maria Souza'] },
          { name: 'email', values: ['maria@exemplo.com'] },
          { name: 'phone_number', values: ['11999999999'] },
        ],
      }],
    };

    const result = await service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'campaign_1' });

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toEqual({
      name: 'Maria Souza', email: 'maria@exemplo.com', phone: '11999999999', createdAt: '2026-09-21T12:00:00Z',
    });
  });

  it('BUG FIX: campanha externa (sem registro local) resolve via ads e mapeia keys tokenizadas pelas questions do form', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    // Nenhuma campanha no banco local — criada fora do Fury
    meta.campaignAdsByCampaign.set('meta_camp_1', ['ad_1']);
    meta.adLeadsByAd.set('ad_1', [{
      created_time: '2026-09-23T12:00:00Z', form_id: 'form_tok',
      field_data: [
        { name: 'question1', values: ['Maria Souza'] },
        { name: 'question2', values: ['maria@exemplo.com'] },
        { name: 'question3', values: ['11999999999'] },
      ],
    }]);
    meta.formQuestionsByForm.set('form_tok', [
      { key: 'question1', type: 'FULL_NAME' },
      { key: 'question2', type: 'EMAIL' },
      { key: 'question3', type: 'PHONE' },
    ]);

    const result = await service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'meta_camp_1' });

    expect(result.leads).toEqual([{
      name: 'Maria Souza', email: 'maria@exemplo.com', phone: '11999999999', createdAt: '2026-09-23T12:00:00Z',
    }]);
  });

  it('fallback: campo tokenizado sem questions disponíveis usa nomes fixos', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.campaignAdsByCampaign.set('meta_camp_2', ['ad_2']);
    meta.adLeadsByAd.set('ad_2', [{
      created_time: '2026-09-23T12:00:00Z', form_id: 'form_sem_q',
      field_data: [
        { name: 'full_name', values: ['João'] },
        { name: 'email', values: ['joao@x.com'] },
        { name: 'phone_number', values: ['21988887777'] },
      ],
    }]);
    // formQuestionsByForm vazio → cai nos nomes fixos

    const result = await service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'meta_camp_2' });
    expect(result.leads[0]).toEqual({
      name: 'João', email: 'joao@x.com', phone: '21988887777', createdAt: '2026-09-23T12:00:00Z',
    });
  });

  it('campanha externa sem ads → leads vazios', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    // nenhum ad registrado para meta_camp_3
    const result = await service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'meta_camp_3' });
    expect(result.leads).toEqual([]);
  });

  it('retorna lista vazia para campanha sem formulário', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    repo.campaigns.push({ id: 'campaign_1', tenantId: TENANT_ID, budget: {} } as any);

    const result = await service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'campaign_1' });
    expect(result.leads).toEqual([]);
  });

  it('erro da Meta ao buscar campanha inexistente é propagado (não vira lista vazia)', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    // Erro REAL do metaApiCall: Error simples com metaCode anexado (não AppError).
    meta.getCampaignAds = async (campaignId: string) => {
      if (campaignId === 'meta_inexistente') throw metaError(100, '[Meta API] 100: Invalid parameter');
      return [];
    };

    await expect(service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'meta_inexistente' }))
      .rejects.toMatchObject({ code: 'INVALID_PARAMETER', statusCode: 400 });
  });

  it('getCampaignAds com metaCode 190 → META_TOKEN_EXPIRED (401)', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.getCampaignAds = async () => { throw metaError(190, 'Access token has expired'); };

    await expect(service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'meta_ext_1' }))
      .rejects.toMatchObject({ code: 'META_TOKEN_EXPIRED', statusCode: 401 });
  });

  it('getAdLeads com metaCode 100 → INVALID_PARAMETER (400)', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.campaignAdsByCampaign.set('meta_ext_2', ['ad_x']);
    meta.getAdLeads = async () => { throw metaError(100, 'Invalid parameter'); };

    await expect(service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'meta_ext_2' }))
      .rejects.toMatchObject({ code: 'INVALID_PARAMETER', statusCode: 400 });
  });

  it('getLeadFormData com metaCode 190 → META_TOKEN_EXPIRED (401)', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    repo.campaigns.push({ id: 'campaign_form', tenantId: TENANT_ID, budget: { lead_form_id: 'form_1' } } as any);
    meta.getLeadFormData = async () => { throw metaError(190, 'expired'); };

    await expect(service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'campaign_form' }))
      .rejects.toMatchObject({ code: 'META_TOKEN_EXPIRED', statusCode: 401 });
  });

  it('campanha inexistente no Meta (code 100 + "does not exist") → 404 CAMPAIGN_NOT_FOUND', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.getCampaignAds = async () => {
      throw metaError(100, 'Unsupported get request. Object with ID 123 does not exist');
    };

    await expect(service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'meta_apagada' }))
      .rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND', statusCode: 404 });
  });

  it('fallback META_SYSTEM_ACCESS_TOKEN sem leads_retrieval (#200) → META_PERMISSION_DENIED (403)', async () => {
    const prev = process.env.META_SYSTEM_ACCESS_TOKEN;
    process.env.META_SYSTEM_ACCESS_TOKEN = 'system_token_for_test';
    try {
      const { service, meta } = makeService();
      // Sem conexão Meta local → usa o token de sistema; o Meta responde #200 (falta leads_retrieval).
      meta.getCampaignAds = async () => { throw metaError(200, '(#200) Permission error', { metaType: 'OAuthException' }); };

      await expect(service.getCampaignLeads({ tenantId: TENANT_ID, campaignId: 'meta_externa' }))
        .rejects.toMatchObject({ code: 'META_PERMISSION_DENIED', statusCode: 403 });
    } finally {
      if (prev === undefined) delete process.env.META_SYSTEM_ACCESS_TOKEN;
      else process.env.META_SYSTEM_ACCESS_TOKEN = prev;
    }
  });
});

describe('CampaignsService.getAllCampaignLeads', () => {
  it('agrega leads das campanhas OUTCOME_LEADS da Meta (inclui externas), com campaignId/Name', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.listCampaignsResult = [
      { id: 'meta_form_1', name: 'Camp Formulário', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
      { id: 'meta_traffic', name: 'Camp Tráfego', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE' },
      { id: 'meta_form_2', name: 'Camp Formulário 2', objective: 'OUTCOME_LEADS', status: 'PAUSED' },
    ];
    meta.campaignAdsByCampaign.set('meta_form_1', ['ad_f1']);
    meta.campaignAdsByCampaign.set('meta_form_2', ['ad_f2']);
    meta.adLeadsByAd.set('ad_f1', [{
      created_time: '2026-09-21T12:00:00Z',
      field_data: [
        { name: 'full_name', values: ['Maria Souza'] },
        { name: 'email', values: ['maria@exemplo.com'] },
        { name: 'phone_number', values: ['11999999999'] },
      ],
    }]);
    meta.adLeadsByAd.set('ad_f2', [{
      created_time: '2026-09-22T12:00:00Z',
      field_data: [
        { name: 'full_name', values: ['João'] },
        { name: 'email', values: ['joao@x.com'] },
        { name: 'phone_number', values: ['21988887777'] },
      ],
    }]);

    const result = await service.getAllCampaignLeads({ tenantId: TENANT_ID });

    expect(result.leads).toHaveLength(2);
    const [first, second] = result.leads;
    expect(first).toMatchObject({
      name: 'Maria Souza', email: 'maria@exemplo.com', phone: '11999999999',
      campaignId: 'meta_form_1', campaignName: 'Camp Formulário',
    });
    expect(second).toMatchObject({ campaignId: 'meta_form_2', name: 'João' });
  });

  it('retorna vazio quando a Meta não tem campanhas de Formulário', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.listCampaignsResult = [
      { id: 't1', name: 'Tráfego', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE' },
    ];

    const result = await service.getAllCampaignLeads({ tenantId: TENANT_ID });
    expect(result.leads).toEqual([]);
  });

  it('falha em uma campanha não derruba a listagem das demais', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.listCampaignsResult = [
      { id: 'ok_1', name: 'OK', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
      { id: 'bad_1', name: 'Ruim', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
    ];
    meta.campaignAdsByCampaign.set('ok_1', ['ad_ok']);
    meta.adLeadsByAd.set('ad_ok', [{ created_time: '2026-09-21T00:00:00Z', field_data: [] }]);
    meta.getCampaignAds = async (campaignId: string) => {
      if (campaignId === 'bad_1') throw new Error('Meta down');
      return [{ id: 'ad_ok' }];
    };

    const result = await service.getAllCampaignLeads({ tenantId: TENANT_ID });
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].campaignId).toBe('ok_1');
  });

  it('falha do getLeadCampaigns (metaCode 190) propaga META_TOKEN_EXPIRED — não vira 500 silencioso', async () => {
    const { service, meta, repo } = makeService();
    makeLeadsEnv(meta, repo);
    meta.listCampaigns = async () => { throw metaError(190, 'Access token has expired'); };

    await expect(service.getAllCampaignLeads({ tenantId: TENANT_ID }))
      .rejects.toMatchObject({ code: 'META_TOKEN_EXPIRED', statusCode: 401 });
  });
});
