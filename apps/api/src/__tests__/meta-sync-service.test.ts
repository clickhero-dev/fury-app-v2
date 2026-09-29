// =============================================================================
// BDD — T003: MetaSyncService.syncTenant (pipeline assíncrono Meta)
//
/*
# Language: pt-BR

Funcionalidade: Sincronização assíncrona Meta por tenant (pipeline)

  Cenário: sincronização completa (happy path)
    Dado tenant com conexão Meta e campanhas na conta
    Quando syncTenant({ tenantId, reason })
    Então faz upsert dos snapshots das campanhas
    E busca insights 30d level=campaign (1 chamada account-level)
    E coleta leads das campanhas OUTCOME_LEADS com form
    E persiste mídia Instagram com insights
    E atualiza o espelho local campaigns.metrics/lastSyncedAt
    E grava meta_sync_runs status 'success'
    E invalida caches (campaigns + http)

  Cenário: token expirado (Meta code 190) derruba o run como failed
    Dado listAccountCampaigns lança erro meta code 190
    Quando syncTenant
    Então meta_sync_runs status 'failed' com errorCode META_TOKEN_EXPIRED
    E não enfileira mais passos

  Cenário: erro #200 em UMA campanha vira partial (as demais seguem)
    Dado coleta de leads da campanha X lança erro #200
    Quando syncTenant
    Então meta_sync_runs status 'partial' com partial_failures contendo a campanha X
    E as demais campanhas foram persistidas

  Cenário: timeout/5xx no account-level derruba o run como failed
    Dado listAccountCampaigns lança timeout (httpStatus 504)
    Quando syncTenant
    Então meta_sync_runs status 'failed' com errorCode META_TIMEOUT

  Cenário: N campanhas são persistidas em batch
    Dado conta com N campanhas
    Quando syncTenant
    Então upsertCampaignSnapshots é chamado 1x com as N campanhas (batch)

  Cenário: re-run é idempotente e reusa has_lead_form do snapshot
    Dado 1º run que gravou has_lead_form=true no snapshot
    Quando syncTenant roda de novo
    Então campaignHasLeadForm NÃO é chamado de novo (usa snapshot)
    E os upserts continuam idempotentes

  Cenário: sem conexão Meta → failed (META_CONNECTION_NOT_FOUND)
    Dado getMetaContext lança META_CONNECTION_NOT_FOUND
    Quando syncTenant
    Então meta_sync_runs status 'failed' com errorCode META_CONNECTION_NOT_FOUND

  Cenário: uma conta compartilhada sincroniza a Meta uma vez e replica por tenant
    Dado dois tenants vinculados à mesma ad account
    Quando syncAdAccount roda
    Então a API Meta é chamada uma vez e ambos os repositories registram o run
*/
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@fury/db', () => {
  const table = new Proxy({}, { get: () => ({}) });
  return { db: {}, brandKits: table, clientGoals: table, metaConnections: table, tenants: table, users: table, businessProfileSettings: table };
});

import { AppError } from '../middleware/errorHandler.js';
import { MetaSyncService, type MetaSyncContext } from '../services/meta/meta-sync.service.js';

const tenantId = 'd4e3f2c1-0000-4000-8000-00000000000d';
const AD_ACCOUNT = 'act_123';
const TOKEN = 'EAAC-fake-token';

function metaApiError(code: number, opts?: { status?: number; message?: string }) {
  const err: any = new Error(opts?.message ?? `[Meta API] ${code}: oops`);
  err.metaCode = code;
  err.metaType = code === 200 ? 'OAuthException' : undefined;
  err.httpStatus = opts?.status;
  return err;
}

function makeFakes(overrides: {
  existingSnapshots?: Array<{ metaCampaignId: string; hasLeadForm: boolean }>;
  campaigns?: Array<{ metaCampaignId: string; name: string; objective: string; status: string }>;
} = {}) {
  const existingByMeta = new Map(
    (overrides.existingSnapshots ?? []).map((s) => [s.metaCampaignId, s.hasLeadForm])
  );

  const repo = {
    findCampaignSnapshots: vi.fn(async () => {
      const items = (overrides.campaigns ?? []).map((c) => ({
        metaCampaignId: c.metaCampaignId,
        hasLeadForm: existingByMeta.has(c.metaCampaignId) ? existingByMeta.get(c.metaCampaignId) : null,
        objective: c.objective,
      }));
      return { items, total: items.length };
    }),
    findLocalLeadFormByMetaIds: vi.fn(async () => new Map<string, string | null>()),
    upsertCampaignSnapshots: vi.fn(async () => {}),
    updateSnapshotHasLeadForm: vi.fn(async () => {}),
    updateSnapshotMetrics: vi.fn(async () => {}),
    markCampaignInsightsFetched: vi.fn(async () => {}),
    upsertCampaignDailyInsights: vi.fn(async () => {}),
    upsertLeads: vi.fn(async () => {}),
    upsertInstagramMedia: vi.fn(async () => {}),
    updateLocalCampaignMetrics: vi.fn(async () => {}),
    recordSyncRun: vi.fn(async (input: any) => ({ id: 'run-1', ...input })),
  };

  const metaApi = {
    listAccountCampaigns: vi.fn(async () => []),
    campaignHasLeadForm: vi.fn(async () => true),
    getMetaInsights: vi.fn(async () => ({ data: [], paging: undefined })),
    listCampaignAds: vi.fn(async () => []),
    listAdLeads: vi.fn(async () => []),
    getLeadFormQuestions: vi.fn(async () => []),
    getInstagramMedia: vi.fn(async () => []),
    getInstagramMediaInsights: vi.fn(async () => ({ reach: 0, saved: 0, shares: 0, replies: 0 })),
  };

  const deps = {
    repoFactory: () => repo as any,
    getMetaContext: vi.fn(async (): Promise<MetaSyncContext> => ({
      accessToken: TOKEN,
      adAccountId: AD_ACCOUNT,
      instagramUserId: null,
    })),
    metaApi: metaApi as any,
    invalidateCampaignsCache: vi.fn(async () => {}),
    invalidateHttpCache: vi.fn(async () => {}),
  };

  return { repo, metaApi, deps };
}

describe('BDD: MetaSyncService.syncTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Cenário: syncAdAccount compartilha chamadas Meta e grava para todos os tenants', async () => {
    const { repo, metaApi, deps } = makeFakes();
    const secondRepo = { ...repo, recordSyncRun: vi.fn(async () => ({ id: 'run-2' })) };
    deps.repoFactory = vi.fn((id: string) => id === 't2' ? secondRepo : repo) as any;
    (deps as any).getMetaContextsByAdAccount = vi.fn(async () => [
      { tenantId, context: { accessToken: TOKEN, adAccountId: AD_ACCOUNT, instagramUserId: null } },
      { tenantId: 't2', context: { accessToken: 'different-token', adAccountId: AD_ACCOUNT, instagramUserId: null } },
    ]);

    await new MetaSyncService(deps as any).syncAdAccount({ adAccountId: AD_ACCOUNT, reason: 'scheduled' });

    expect(metaApi.listAccountCampaigns).toHaveBeenCalledTimes(1);
    expect(repo.recordSyncRun).toHaveBeenCalledTimes(1);
    expect(secondRepo.recordSyncRun).toHaveBeenCalledTimes(1);
    expect(deps.invalidateCampaignsCache).toHaveBeenCalledWith(tenantId);
    expect(deps.invalidateCampaignsCache).toHaveBeenCalledWith('t2');
  });

  it('Cenário: promessa rejeitada no cache não contamina os demais tenants (evict on reject)', async () => {
    const { repo, metaApi, deps } = makeFakes();
    const secondRepo = { ...repo, recordSyncRun: vi.fn(async () => ({ id: 'run-2' })) };
    deps.repoFactory = vi.fn((id: string) => (id === 't2' ? secondRepo : repo)) as any;
    (deps as any).getMetaContextsByAdAccount = vi.fn(async () => [
      { tenantId, context: { accessToken: TOKEN, adAccountId: AD_ACCOUNT, instagramUserId: null } },
      { tenantId: 't2', context: { accessToken: 'different-token', adAccountId: AD_ACCOUNT, instagramUserId: null } },
    ]);
    metaApi.listAccountCampaigns
      .mockRejectedValueOnce(new Error('rate limit transitório'))
      .mockResolvedValueOnce([]);

    const results = await new MetaSyncService(deps as any).syncAdAccount({ adAccountId: AD_ACCOUNT, reason: 'scheduled' });

    // 1ª chamada falha (t1) e é removida do cache → t2 re-executa e obtém sucesso.
    expect(metaApi.listAccountCampaigns).toHaveBeenCalledTimes(2);
    expect(results[0].tenantId).toBe(tenantId);
    expect(results[0].status).toBe('failed');
    expect(results[1].tenantId).toBe('t2');
    expect(results[1].status).toBe('success');
  });

  it('Cenário: sincronização completa (happy path)', async () => {
    const { repo, metaApi, deps } = makeFakes({
      existingSnapshots: [{ metaCampaignId: 'm1', hasLeadForm: true }],
      campaigns: [{ metaCampaignId: 'm1', name: 'Camp 1', objective: 'OUTCOME_LEADS', status: 'ACTIVE' }],
    });
    metaApi.listAccountCampaigns.mockResolvedValue([
      { id: 'm1', name: 'Camp 1', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
    ]);
    metaApi.getMetaInsights.mockResolvedValue({
      data: [
        {
          campaign_id: 'm1',
          date_start: '2026-09-25',
          date_stop: '2026-09-25',
          campaign_name: 'Camp 1',
          spend: '100',
          impressions: '1000',
          clicks: '10',
          ctr: '1',
          cpc: '10',
          cpm: '100',
          actions: [{ action_type: 'purchase', value: '5' }],
          purchase_roas: [{ action_type: 'purchase', value: '2.5' }],
        },
      ],
    });
    metaApi.listCampaignAds.mockResolvedValue([{ id: 'ad1', name: 'Ad 1' }]);
    metaApi.listAdLeads.mockResolvedValue([
      {
        id: 'lead1',
        created_time: '2026-09-01T10:00:00+0000',
        field_data: [
          { name: 'full_name', values: ['Maria'] },
          { name: 'email', values: ['maria@x.com'] },
          { name: 'phone_number', values: ['5511999999999'] },
        ],
      },
    ]);
    deps.getMetaContext.mockResolvedValue({
      accessToken: TOKEN,
      adAccountId: AD_ACCOUNT,
      instagramUserId: 'ig-user-1',
    });
    metaApi.getInstagramMedia.mockResolvedValue([
      {
        id: 'media1',
        media_type: 'IMAGE',
        media_product_type: 'FEED',
        timestamp: '2026-09-01T00:00:00+0000',
        like_count: 5,
        comments_count: 1,
      },
    ]);
    metaApi.getInstagramMediaInsights.mockResolvedValue({ reach: 100, saved: 3, shares: 2, replies: 1 });

    const service = new MetaSyncService(deps as any);
    const result = await service.syncTenant({ tenantId, reason: 'test' });

    expect(result.status).toBe('success');
    expect(metaApi.getMetaInsights).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'campaign', adAccountId: AD_ACCOUNT, timeIncrement: 1 })
    );
    expect(repo.upsertCampaignDailyInsights).toHaveBeenCalledWith([
      expect.objectContaining({ metaCampaignId: 'm1', date: '2026-09-25' }),
    ]);
    expect(repo.upsertCampaignSnapshots).toHaveBeenCalled();
    expect(repo.upsertLeads).toHaveBeenCalled();
    expect(repo.upsertInstagramMedia).toHaveBeenCalled();
    expect(repo.updateLocalCampaignMetrics).toHaveBeenCalledWith('m1', expect.anything());
    expect(repo.recordSyncRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    expect(deps.invalidateCampaignsCache).toHaveBeenCalledWith(tenantId);
    expect(deps.invalidateHttpCache).toHaveBeenCalledWith(tenantId, expect.any(Array));
  });

  it('Cenário: campanha recém descoberta verifica formulário antes do default false do banco', async () => {
    const { repo, metaApi, deps } = makeFakes();
    metaApi.listAccountCampaigns.mockResolvedValue([
      { id: 'new-campaign', name: 'Nova', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
    ]);
    repo.findCampaignSnapshots.mockImplementation(async () =>
      repo.upsertCampaignSnapshots.mock.calls.length === 0
        ? { items: [], total: 0 }
        : {
            items: [{ metaCampaignId: 'new-campaign', hasLeadForm: false, objective: 'OUTCOME_LEADS' }],
            total: 1,
          }
    );
    metaApi.listCampaignAds.mockResolvedValue([{ id: 'new-ad' }]);
    metaApi.listAdLeads.mockResolvedValue([{ id: 'new-lead', field_data: [] }]);

    const service = new MetaSyncService(deps as any);
    await service.syncTenant({ tenantId, reason: 'test' });

    expect(metaApi.campaignHasLeadForm).toHaveBeenCalledWith('new-campaign', TOKEN);
    expect(repo.updateSnapshotHasLeadForm).toHaveBeenCalledWith('new-campaign', true);
    expect(repo.upsertLeads).toHaveBeenCalledWith([
      expect.objectContaining({ metaLeadId: 'new-lead', metaCampaignId: 'new-campaign' }),
    ]);
  });

  it('Cenário: sync traduz campos tokenizados usando perguntas do formulário e atualiza leads existentes', async () => {
    const { repo, metaApi, deps } = makeFakes({
      existingSnapshots: [{ metaCampaignId: 'm1', hasLeadForm: true }],
      campaigns: [{ metaCampaignId: 'm1', name: 'Camp 1', objective: 'OUTCOME_LEADS', status: 'ACTIVE' }],
    });
    metaApi.listAccountCampaigns.mockResolvedValue([{ id: 'm1', name: 'Camp 1', objective: 'OUTCOME_LEADS', status: 'ACTIVE' }]);
    metaApi.listCampaignAds.mockResolvedValue([{ id: 'ad1' }, { id: 'ad2' }]);
    metaApi.listAdLeads.mockResolvedValue([{
      id: 'lead1', form_id: 'form1', created_time: '2026-09-23T22:05:00+0000',
      field_data: [
        { name: 'question1', values: ['Maria Souza'] },
        { name: 'question2', values: ['maria@exemplo.com'] },
        { name: 'question3', values: ['11999999999'] },
      ],
    }]);
    metaApi.getLeadFormQuestions.mockResolvedValue([
      { key: 'question1', type: 'FULL_NAME' },
      { key: 'question2', type: 'EMAIL' },
      { key: 'question3', type: 'PHONE' },
    ]);

    const result = await new MetaSyncService(deps as any).syncTenant({ tenantId, reason: 'test' });

    expect(result.status).toBe('success');
    expect(metaApi.getLeadFormQuestions).toHaveBeenCalledTimes(1);
    expect(metaApi.getLeadFormQuestions).toHaveBeenCalledWith('form1', TOKEN);
    expect(repo.upsertLeads).toHaveBeenCalledWith([expect.objectContaining({
      metaLeadId: 'lead1', name: 'Maria Souza', email: 'maria@exemplo.com', phone: '11999999999',
    })]);
  });

  it('Cenário: falha ao ler perguntas preserva os campos padrão e continua o sync', async () => {
    const { repo, metaApi, deps } = makeFakes({
      existingSnapshots: [{ metaCampaignId: 'm1', hasLeadForm: true }],
      campaigns: [{ metaCampaignId: 'm1', name: 'Camp 1', objective: 'OUTCOME_LEADS', status: 'ACTIVE' }],
    });
    metaApi.listAccountCampaigns.mockResolvedValue([{ id: 'm1', name: 'Camp 1', objective: 'OUTCOME_LEADS', status: 'ACTIVE' }]);
    metaApi.listCampaignAds.mockResolvedValue([{ id: 'ad1' }]);
    metaApi.listAdLeads.mockResolvedValue([{
      id: 'lead2', form_id: 'form2', field_data: [
        { name: 'full_name', values: ['João'] },
        { name: 'email', values: ['joao@exemplo.com'] },
        { name: 'phone_number', values: ['21999999999'] },
      ],
    }]);
    metaApi.getLeadFormQuestions.mockRejectedValue(new Error('perguntas indisponíveis'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await new MetaSyncService(deps as any).syncTenant({ tenantId, reason: 'test' });

    expect(result.status).toBe('success');
    expect(repo.upsertLeads).toHaveBeenCalledWith([expect.objectContaining({
      metaLeadId: 'lead2', name: 'João', email: 'joao@exemplo.com', phone: '21999999999',
    })]);
    warning.mockRestore();
  });

  it('Cenário: token expirado (190) → failed META_TOKEN_EXPIRED', async () => {
    const { metaApi, deps, repo } = makeFakes();
    metaApi.listAccountCampaigns.mockRejectedValue(metaApiError(190, { status: 401 }));

    const service = new MetaSyncService(deps as any);
    const result = await service.syncTenant({ tenantId, reason: 'test' });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('META_TOKEN_EXPIRED');
    expect(repo.recordSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorCode: 'META_TOKEN_EXPIRED' })
    );
    expect(metaApi.getMetaInsights).not.toHaveBeenCalled();
  });

  it('Cenário: erro #200 em UMA campanha → partial (demais seguem)', async () => {
    const { repo, metaApi, deps } = makeFakes();
    metaApi.listAccountCampaigns.mockResolvedValue([
      { id: 'm1', name: 'A', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
      { id: 'm2', name: 'B', objective: 'OUTCOME_SALES', status: 'ACTIVE' },
    ]);
    repo.findCampaignSnapshots.mockResolvedValue({
      items: [
        { metaCampaignId: 'm1', hasLeadForm: true, objective: 'OUTCOME_LEADS' },
        { metaCampaignId: 'm2', hasLeadForm: false, objective: 'OUTCOME_SALES' },
      ],
      total: 2,
    });
    metaApi.listCampaignAds.mockImplementation(async (campaignId: string) => {
      if (campaignId === 'm1') throw metaApiError(200);
      return [{ id: 'ad2' }];
    });

    const service = new MetaSyncService(deps as any);
    const result = await service.syncTenant({ tenantId, reason: 'test' });

    expect(result.status).toBe('partial');
    expect(result.partialFailures.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.partialFailures)).toContain('m1');
    expect(repo.upsertCampaignSnapshots).toHaveBeenCalled();
    expect(repo.recordSyncRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'partial' }));
  });

  it('Cenário: timeout/5xx no account-level → failed META_TIMEOUT', async () => {
    const { metaApi, deps, repo } = makeFakes();
    metaApi.listAccountCampaigns.mockRejectedValue(metaApiError(1, { status: 504, message: 'timeout' }));

    const service = new MetaSyncService(deps as any);
    const result = await service.syncTenant({ tenantId, reason: 'test' });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('META_TIMEOUT');
    expect(repo.recordSyncRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('Cenário: N campanhas persistidas em batch (1 chamada upsertCampaignSnapshots)', async () => {
    const { repo, metaApi, deps } = makeFakes();
    metaApi.listAccountCampaigns.mockResolvedValue([
      { id: 'm1', name: 'A', objective: 'OUTCOME_SALES', status: 'ACTIVE' },
      { id: 'm2', name: 'B', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
      { id: 'm3', name: 'C', objective: 'OUTCOME_LEADS', status: 'PAUSED' },
    ]);
    repo.findCampaignSnapshots.mockResolvedValue({
      items: [
        { metaCampaignId: 'm1', hasLeadForm: false, objective: 'OUTCOME_SALES' },
        { metaCampaignId: 'm2', hasLeadForm: false, objective: 'OUTCOME_LEADS' },
        { metaCampaignId: 'm3', hasLeadForm: false, objective: 'OUTCOME_LEADS' },
      ],
      total: 3,
    });

    const service = new MetaSyncService(deps as any);
    await service.syncTenant({ tenantId, reason: 'test' });

    expect(repo.upsertCampaignSnapshots).toHaveBeenCalledTimes(1);
    const [batch] = repo.upsertCampaignSnapshots.mock.calls[0];
    expect(batch.length).toBe(3);
  });

  it('Cenário: re-run idempotente reusa has_lead_form do snapshot', async () => {
    const { repo, metaApi, deps } = makeFakes();
    metaApi.listAccountCampaigns.mockResolvedValue([
      { id: 'm1', name: 'A', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
    ]);
    repo.findCampaignSnapshots.mockResolvedValue({
      items: [{ metaCampaignId: 'm1', hasLeadForm: true, objective: 'OUTCOME_LEADS' }],
      total: 1,
    });

    const service = new MetaSyncService(deps as any);
    await service.syncTenant({ tenantId, reason: 'test' });
    await service.syncTenant({ tenantId, reason: 'test' });

    expect(metaApi.campaignHasLeadForm).not.toHaveBeenCalled();
    expect(repo.recordSyncRun).toHaveBeenCalledTimes(2);
  });

  it('Cenário: não consulta novamente insights diários já sincronizados no último dia', async () => {
    const { repo, metaApi, deps } = makeFakes();
    repo.findCampaignSnapshots.mockResolvedValue({
      items: [{ metaCampaignId: 'm1', hasLeadForm: false, objective: 'OUTCOME_SALES', lastInsightsAt: new Date() }],
      total: 1,
    } as any);
    metaApi.listAccountCampaigns.mockResolvedValue([{ id: 'm1', name: 'Camp', objective: 'OUTCOME_SALES', status: 'ACTIVE' }]);

    await new MetaSyncService(deps as any).syncTenant({ tenantId, reason: 'scheduled' });

    expect(metaApi.getMetaInsights).not.toHaveBeenCalled();
  });

  it('prioriza campanhas com formulário já conhecido antes de consultar campanhas desconhecidas', async () => {
    const { metaApi, deps, repo } = makeFakes();
    metaApi.listAccountCampaigns.mockResolvedValue([
      { id: 'unknown', name: 'Desconhecida', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
      { id: 'known', name: 'Conhecida', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
    ]);
    repo.findCampaignSnapshots.mockResolvedValue({
      items: [
        { metaCampaignId: 'unknown', hasLeadForm: null, objective: 'OUTCOME_LEADS' },
        { metaCampaignId: 'known', hasLeadForm: true, objective: 'OUTCOME_LEADS' },
      ],
      total: 2,
    } as any);
    metaApi.listCampaignAds.mockImplementation(async (id: string) => {
      if (id === 'known') return [{ id: 'known-ad' }];
      return [];
    });

    await new MetaSyncService(deps as any).syncTenant({ tenantId, reason: 'test' });

    expect(metaApi.listCampaignAds).toHaveBeenCalledWith('known', TOKEN);
    expect(metaApi.campaignHasLeadForm.mock.invocationCallOrder[0]).toBeGreaterThan(
      metaApi.listCampaignAds.mock.invocationCallOrder[0]
    );
  });

  it('interrompe a coleta de leads após limite de requisições da Meta', async () => {
    const { metaApi, deps, repo } = makeFakes();
    metaApi.listAccountCampaigns.mockResolvedValue([
      { id: 'm1', name: 'A', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
      { id: 'm2', name: 'B', objective: 'OUTCOME_LEADS', status: 'ACTIVE' },
    ]);
    repo.findCampaignSnapshots.mockResolvedValue({
      items: [
        { metaCampaignId: 'm1', hasLeadForm: null, objective: 'OUTCOME_LEADS' },
        { metaCampaignId: 'm2', hasLeadForm: null, objective: 'OUTCOME_LEADS' },
      ],
      total: 2,
    } as any);
    const rateLimit = metaApiError(613, { message: 'User request limit reached' });
    metaApi.campaignHasLeadForm.mockRejectedValue(rateLimit);
    deps.getMetaContext.mockResolvedValue({ accessToken: TOKEN, adAccountId: AD_ACCOUNT, instagramUserId: 'ig-user-1' });

    const result = await new MetaSyncService(deps as any).syncTenant({ tenantId, reason: 'test' });

    expect(metaApi.campaignHasLeadForm).toHaveBeenCalledTimes(1);
    expect(metaApi.getInstagramMedia).not.toHaveBeenCalled();
    expect(result.status).toBe('partial');
    expect(result.partialFailures).toHaveLength(1);
    expect(result.partialFailures[0]).toEqual(expect.objectContaining({ item_id: 'm1', code: 'META_RATE_LIMIT' }));
  });

  it('Cenário: sem conexão Meta → failed META_CONNECTION_NOT_FOUND', async () => {
    const { deps, repo } = makeFakes();
    deps.getMetaContext.mockRejectedValue(
      new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexão Meta.')
    );

    const service = new MetaSyncService(deps as any);
    const result = await service.syncTenant({ tenantId, reason: 'test' });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('META_CONNECTION_NOT_FOUND');
    expect(repo.recordSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorCode: 'META_CONNECTION_NOT_FOUND' })
    );
  });
});
