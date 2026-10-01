/*
Funcionalidade: exclusividade e confirmação segura dos ativos Meta
  Cenário: tenant não seleciona conta já vinculada a outro tenant
    Dado uma conta de anúncios selecionada em outro tenant
    Quando o tenant atual tenta selecioná-la
    Então recebe AD_ACCOUNT_IN_USE com mensagem segura
  Cenário: salvar uma BM, página/Instagram e conta de anúncio válidos
    Dado que os ativos pertencem à Business Manager selecionada
    Quando o onboarding salva a seleção
    Então a API persiste e confirma os mesmos ativos
  Cenário: recusar conta de anúncio fora da BM
    Dado uma conta de anúncio que não pertence à Business Manager
    Quando o onboarding salva a seleção
    Então a API falha sem persistir
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('@fury/db', () => {
  const table = new Proxy({}, { get: () => ({}) });
  return {
    db: {},
    brandKits: table,
    clientGoals: table,
    metaConnections: table,
    tenants: table,
    users: table,
    businessProfileSettings: table,
  };
});

import { MetaService } from '../services/meta/meta.service.js';

const connection = {
  id: 'm1',
  tenantId: 't1',
  metaUserId: 'mu1',
  accessToken: 'enc:enc:enc',
  tokenExpiresAt: null,
  adAccounts: [{ id: 'act_1', name: 'Conta 1', account_status: 1 }],
  selectedAdAccountId: 'act_1',
  createdAt: new Date(),
  selectedBusinessIds: ['b1'],
  selectedPageIds: ['p1'],
  selectedAdAccountIds: ['act_1'],
  selectedInstagramUserId: 'ig1',
  selectedWhatsappNumberIds: ['wa1'],
};

function makeRepo(override: Record<string, any> = {}) {
  return {
    findLatestMetaConnection: vi.fn(async () => null),
    findMetaConnectionById: vi.fn(async () => null),
    createMetaConnection: vi.fn(async () => connection),
    patchMetaConnection: vi.fn(async () => undefined),
    deleteMetaConnection: vi.fn(async () => undefined),
    countOtherTenantsUsingSelectedAdAccount: vi.fn(async () => 0),
    ...override,
  } as any;
}

function makeSvc(
  repo: any,
  metaApiOverrides: Record<string, any> = {},
  metaSyncRepo: any = { deleteAllMetaSyncedData: vi.fn(async () => undefined) },
) {
  return new MetaService(
    () => repo,
    {
      metaApi: {
        exchangeCodeForToken: vi.fn(async () => ({ access_token: 'st', expires_in: 100 })),
        exchangeForLongLivedToken: vi.fn(async () => ({ access_token: 'll', expires_in: 86400 })),
        getBusinessAdAccounts: vi.fn(async () => []),
        getBusinessOwnedPages: vi.fn(async () => []),
        getMetaUserId: vi.fn(async () => 'mu1'),
        getPageWhatsappNumbers: vi.fn(async () => []),
        getWhatsappNumbersForAssets: vi.fn(async () => []),
        getUserAdAccounts: vi.fn(async () => ({ accounts: [], ignoredBusinessIds: [] })),
        getUserBusinesses: vi.fn(async () => []),
        getUserFacebookPages: vi.fn(async () => []),
        getUserPermissions: vi.fn(async () => []),
        ...metaApiOverrides,
      },
      addSyncJob: vi.fn(async () => undefined),
    } as any,
    () => metaSyncRepo,
  );
}

describe('MetaService (deep DI)', () => {
  beforeEach(() => {
    process.env.META_APP_ID = 'app_id_123';
    process.env.META_APP_SECRET = 'app_secret';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.META_REDIRECT_URI = 'http://localhost/api/meta/auth/callback';
  });

  it('generateMetaAuthUrl constrói a URL de OAuth como função pura (env + scopes + state)', () => {
    const svc = makeSvc(makeRepo());
    const url = svc.generateMetaAuthUrl('t1', 'onboarding');
    expect(url).toContain('https://www.facebook.com/v20.0/dialog/oauth');
    expect(url).toContain('client_id=app_id_123');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%2Fapi%2Fmeta%2Fauth%2Fcallback');
    expect(url).toContain('state=');
    expect(url).toContain('business_management');
  });

  it('generateMetaAuthUrl embute frontendUrl (origin de quem inicia o fluxo) no state', () => {
    const svc = makeSvc(makeRepo());
    const url = svc.generateMetaAuthUrl('t1', 'settings', 'https://app.useady.com.br');
    const stateParam = new URL(url).searchParams.get('state') ?? '';
    expect(stateParam).toBeTruthy();

    // O state decodificado deve carregar a frontendUrl para o callback
    // redirecionar de volta ao MESMO domínio do início do fluxo.
    const decoded = jwt.decode(stateParam) as { frontendUrl?: string; context?: string };
    expect(decoded.frontendUrl).toBe('https://app.useady.com.br');
    expect(decoded.context).toBe('settings');
  });

  it('generateMetaAuthUrl pede pages_manage_ads no scope (criação de leadgen_forms — doc Lead Ads)', () => {
    const svc = makeSvc(makeRepo());
    const url = svc.generateMetaAuthUrl('t1', 'onboarding');
    const scope = new URL(url).searchParams.get('scope') ?? '';
    const scopes = scope.split(',');
    // Doc oficial (developers.facebook.com/docs/marketing-api/guides/lead-ads/create/):
    // criar form exige ads_management + pages_manage_ads + pages_read_engagement + pages_show_list.
    expect(scopes).toContain('pages_manage_ads');
    expect(scopes).toContain('pages_manage_metadata'); // webhooks leadgen (futuro) — não remover
    expect(scopes).toContain('leads_retrieval'); // leitura de leads ("Ver leads")
  });

  it('generateMetaAuthUrl com rerequest: auth_type=rerequest na URL + flag no state', () => {
    const svc = makeSvc(makeRepo());
    const url = svc.generateMetaAuthUrl('t1', 'settings', 'https://hmg.example', { rerequest: true });
    // Login Dialog NÃO re-pede permissão declinada sem auth_type=rerequest
    // (developers.facebook.com/docs/facebook-login/web/permissions).
    expect(url).toContain('auth_type=rerequest');

    const stateParam = new URL(url).searchParams.get('state') ?? '';
    const decoded = jwt.verify(stateParam, 'test-jwt-secret') as { rerequest?: boolean };
    expect(decoded.rerequest).toBe(true);
  });

  it('generateMetaAuthUrl sem opts NÃO manda auth_type (onboarding byte-idêntico)', () => {
    const svc = makeSvc(makeRepo());
    const url = svc.generateMetaAuthUrl('t1', 'settings', 'https://app.useady.com.br');
    expect(url).not.toContain('auth_type');
    const stateParam = new URL(url).searchParams.get('state') ?? '';
    const decoded = jwt.decode(stateParam) as { rerequest?: boolean };
    expect(decoded.rerequest).toBeUndefined();
  });

  it('getTenantAssetSelection retorna null quando o tenant não tem conexão', async () => {
    const repo = makeRepo();
    const selection = await makeSvc(repo).getTenantAssetSelection('t1');
    expect(selection).toBeNull();
    expect(repo.findLatestMetaConnection).toHaveBeenCalledWith();
  });

  it('getTenantAssetSelection mapeia os ativos selecionados da conexão via repo', async () => {
    const repo = makeRepo({ findLatestMetaConnection: vi.fn(async () => connection) });
    const selection = await makeSvc(repo).getTenantAssetSelection('t1');
    expect(selection).toEqual({
      businessIds: ['b1'],
      pageIds: ['p1'],
      adAccountIds: ['act_1'],
      instagramUserId: 'ig1',
      whatsappNumberIds: ['wa1'],
    });
  });

  it('saveTenantAssetSelection lança META_CONNECTION_NOT_FOUND sem conexão (sem tocar na Meta)', async () => {
    const repo = makeRepo();
    await expect(
      makeSvc(repo).saveTenantAssetSelection('t1', {
        businessIds: [],
        pageIds: [],
        adAccountIds: [],
        instagramUserId: 'ig_1',
        whatsappNumberIds: [],
      })
    ).rejects.toMatchObject({ code: 'META_CONNECTION_NOT_FOUND' });
    expect(repo.patchMetaConnection).not.toHaveBeenCalled();
  });

  it('confirma a seleção persistida quando BM, página/Instagram e conta pertencem ao tenant', async () => {
    const repo = makeRepo({ findLatestMetaConnection: vi.fn(async () => connection), patchMetaConnection: vi.fn(async () => connection) });
    const service = makeSvc(repo) as any;
    vi.spyOn(service, 'getTenantAccessToken').mockResolvedValue('token');
    service.deps.metaApi.getUserBusinesses.mockResolvedValue([{ id: 'b1', name: 'BM' }]);
    service.deps.metaApi.getBusinessOwnedPages.mockResolvedValue([{ pageId: 'p1', name: 'Página', instagramUserId: 'ig1', instagramUsername: 'perfil' }]);
    service.deps.metaApi.getBusinessAdAccounts.mockResolvedValue([{ id: 'act_1', name: 'Conta', account_status: 1 }]);

    await expect(service.saveTenantAssetSelection('t1', {
      businessIds: ['b1'], pageIds: ['p1'], adAccountIds: ['act_1'], instagramUserId: 'ig1', whatsappNumberIds: [],
    })).resolves.toMatchObject({ instagramUserId: 'ig1', selectedAdAccountId: 'act_1' });
    expect(repo.patchMetaConnection).toHaveBeenCalledOnce();
  });

  it('rejeita conta de anúncio fora da BM sem persistir', async () => {
    const repo = makeRepo({ findLatestMetaConnection: vi.fn(async () => connection) });
    const service = makeSvc(repo) as any;
    vi.spyOn(service, 'getTenantAccessToken').mockResolvedValue('token');
    service.deps.metaApi.getUserBusinesses.mockResolvedValue([{ id: 'b1', name: 'BM' }]);
    service.deps.metaApi.getBusinessOwnedPages.mockResolvedValue([{ pageId: 'p1', name: 'Página', instagramUserId: 'ig1', instagramUsername: 'perfil' }]);
    service.deps.metaApi.getBusinessAdAccounts.mockResolvedValue([]);

    await expect(service.saveTenantAssetSelection('t1', {
      businessIds: ['b1'], pageIds: ['p1'], adAccountIds: ['act_999'], instagramUserId: 'ig1', whatsappNumberIds: [],
    })).rejects.toMatchObject({ code: 'INVALID_META_AD_ACCOUNT' });
    expect(repo.patchMetaConnection).not.toHaveBeenCalled();
  });

  it('selectAdAccount rejeita conta que não pertence à conexão', async () => {
    const repo = makeRepo({ findMetaConnectionById: vi.fn(async () => connection) });
    await expect(makeSvc(repo).selectAdAccount('t1', 'm1', 'act_999')).rejects.toMatchObject({
      code: 'AD_ACCOUNT_NOT_FOUND',
    });
  });

  it('Cenário: selectAdAccount permite temporariamente conta já selecionada por outro tenant', async () => {
    const repo = makeRepo({
      findMetaConnectionById: vi.fn(async () => connection),
      countOtherTenantsUsingSelectedAdAccount: vi.fn(async () => 1),
    });

    await expect(makeSvc(repo).selectAdAccount('t1', 'm1', 'act_1')).resolves.toBe('act_1');
    expect(repo.patchMetaConnection).toHaveBeenCalledWith('m1', { selectedAdAccountId: 'act_1' });
  });

  it('Cenário: selectAdAccount permite a conta do próprio tenant', async () => {
    const repo = makeRepo({ findMetaConnectionById: vi.fn(async () => connection) });

    await expect(makeSvc(repo).selectAdAccount('t1', 'm1', 'act_1')).resolves.toBe('act_1');
    expect(repo.countOtherTenantsUsingSelectedAdAccount).not.toHaveBeenCalled();
    expect(repo.patchMetaConnection).toHaveBeenCalledWith('m1', { selectedAdAccountId: 'act_1' });
  });

  it('Cenário: callback OAuth permite temporariamente conta automática já usada por outro tenant', async () => {
    const repo = makeRepo({
      findLatestMetaConnection: vi.fn(async () => connection),
      countOtherTenantsUsingSelectedAdAccount: vi.fn(async () => 1),
    });
    const svc = makeSvc(repo, {
      getUserAdAccounts: vi.fn(async () => ({
        accounts: [{ id: 'act_1', name: 'Conta 1', account_status: 1 }],
        ignoredBusinessIds: [],
      })),
    });
    const state = new URL(svc.generateMetaAuthUrl('t1', 'settings')).searchParams.get('state')!;

    await expect(svc.handleMetaOAuthCallback('oauth-code', state)).resolves.toMatchObject({ tenantId: 't1' });
  });

  it('deleteTenantMetaConnection limpa os dados sincronizados antes de apagar a conexão', async () => {
    const repo = makeRepo({ findMetaConnectionById: vi.fn(async () => connection) });
    const metaSyncRepo = { deleteAllMetaSyncedData: vi.fn(async () => undefined) };
    const service = makeSvc(repo, {}, metaSyncRepo);

    await service.deleteTenantMetaConnection('t1', 'm1');

    expect(metaSyncRepo.deleteAllMetaSyncedData).toHaveBeenCalledOnce();
    expect(repo.deleteMetaConnection).toHaveBeenCalledWith('m1');
    expect(metaSyncRepo.deleteAllMetaSyncedData.mock.invocationCallOrder[0])
      .toBeLessThan(repo.deleteMetaConnection.mock.invocationCallOrder[0]);
  });

  it('deleteTenantMetaConnection não limpa dados quando a conexão não existe', async () => {
    const repo = makeRepo({ findMetaConnectionById: vi.fn(async () => null) });
    const metaSyncRepo = { deleteAllMetaSyncedData: vi.fn(async () => undefined) };

    await expect(makeSvc(repo, {}, metaSyncRepo).deleteTenantMetaConnection('t1', 'missing'))
      .rejects.toMatchObject({ code: 'META_CONNECTION_NOT_FOUND', statusCode: 404 });

    expect(metaSyncRepo.deleteAllMetaSyncedData).not.toHaveBeenCalled();
    expect(repo.deleteMetaConnection).not.toHaveBeenCalled();
  });
});
