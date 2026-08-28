import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    ...override,
  } as any;
}

function makeSvc(repo: any) {
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
});