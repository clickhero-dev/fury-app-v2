// BDD — guarda de conta de anúncios entre tenants.
/*
Funcionalidade: Exclusividade de conta de anúncios Meta

  Cenário: tenant não seleciona conta já vinculada a outro tenant
    Dado uma conta de anúncios selecionada em outro tenant
    Quando o tenant atual tenta selecioná-la
    Então recebe AD_ACCOUNT_IN_USE com mensagem segura

  Cenário: tenant mantém sua própria conta de anúncios
    Dado a conta já vinculada ao próprio tenant
    Quando a seleciona novamente
    Então a seleção é persistida

  Cenário: OAuth não vincula automaticamente conta usada por outro tenant
    Dado o callback Meta encontra uma conta já vinculada
    Quando conclui a conexão
    Então recebe AD_ACCOUNT_IN_USE
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

function makeSvc(repo: any, metaApiOverrides: Record<string, any> = {}) {
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
        whatsappNumberIds: [],
      })
    ).rejects.toMatchObject({ code: 'META_CONNECTION_NOT_FOUND' });
    expect(repo.patchMetaConnection).not.toHaveBeenCalled();
  });

  it('selectAdAccount rejeita conta que não pertence à conexão', async () => {
    const repo = makeRepo({ findMetaConnectionById: vi.fn(async () => connection) });
    await expect(makeSvc(repo).selectAdAccount('t1', 'm1', 'act_999')).rejects.toMatchObject({
      code: 'AD_ACCOUNT_NOT_FOUND',
    });
  });

  it('Cenário: selectAdAccount rejeita conta já selecionada por outro tenant', async () => {
    const repo = makeRepo({
      findMetaConnectionById: vi.fn(async () => connection),
      countOtherTenantsUsingSelectedAdAccount: vi.fn(async () => 1),
    });

    await expect(makeSvc(repo).selectAdAccount('t1', 'm1', 'act_1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'AD_ACCOUNT_IN_USE',
      message: 'Essa conta de anúncios já está vinculada a outra conta do ady. Escolha outra conta ou conecte com o login Meta da própria empresa.',
    });
    expect(repo.patchMetaConnection).not.toHaveBeenCalled();
  });

  it('Cenário: selectAdAccount permite a conta do próprio tenant', async () => {
    const repo = makeRepo({ findMetaConnectionById: vi.fn(async () => connection) });

    await expect(makeSvc(repo).selectAdAccount('t1', 'm1', 'act_1')).resolves.toBe('act_1');
    expect(repo.countOtherTenantsUsingSelectedAdAccount).toHaveBeenCalledWith('act_1', 't1');
    expect(repo.patchMetaConnection).toHaveBeenCalledWith('m1', { selectedAdAccountId: 'act_1' });
  });

  it('Cenário: callback OAuth rejeita conta automática já usada por outro tenant', async () => {
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

    await expect(svc.handleMetaOAuthCallback('oauth-code', state)).rejects.toMatchObject({
      statusCode: 409,
      code: 'AD_ACCOUNT_IN_USE',
    });
  });
});
