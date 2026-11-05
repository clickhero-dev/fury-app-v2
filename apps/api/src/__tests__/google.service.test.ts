import { describe, it, expect, beforeAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { GoogleService } from '../services/google/google.service.js';
import { encryptToken } from '../utils/crypto.js';

function makeConnection() {
  return {
    id: 'conn-1',
    googleUserId: 'g-user-1',
    accountId: 'accounts/111',
    accountName: 'Minha Empresa',
    accessToken: encryptToken('plain-access-token'),
    refreshToken: encryptToken('plain-refresh-token'),
    tokenExpiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeRepo(override: Record<string, any> = {}) {
  return {
    findGoogleConnection: vi.fn(async () => null),
    findGoogleConnectionById: vi.fn(async () => makeConnection()),
    findGoogleConnectionByRawId: vi.fn(async () => null),
    createGoogleConnection: vi.fn(async (data) => ({ id: 'conn-new', ...data })),
    patchGoogleConnection: vi.fn(async () => undefined),
    deleteGoogleConnection: vi.fn(async () => undefined),
    findBusinessProfile: vi.fn(async () => null),
    findTenant: vi.fn(async () => null),
    upsertBusinessProfile: vi.fn(async () => 'bp-1'),
    createBusinessProfile: vi.fn(async (data) => ({ id: 'p-1', ...data })),
    getBusinessProfile: vi.fn(async () => null),
    patchBusinessProfile: vi.fn(async () => undefined),
    createSyncLog: vi.fn(async (data) => ({ id: 'log-1', ...data })),
    listSyncLogs: vi.fn(async () => []),
    ...override,
  } as any;
}

function makeDeps(override: Record<string, any> = {}) {
  return {
    oauth: {
      exchangeCodeForToken: vi.fn(async () => null),
      getGoogleOAuthConfig: vi.fn(() => ({ clientId: 'cid', clientSecret: 'cs', redirectUri: 'https://app/cb' })),
      revokeGoogleToken: vi.fn(async () => undefined),
    },
    api: { createGoogleApiClient: vi.fn() },
    storage: {
      uploadAsset: vi.fn(async () => 'https://r2.example/photo.jpg'),
      deleteAsset: vi.fn(async () => undefined),
    },
    ...override,
  } as any;
}

function makeSvc(repo: any, deps: any) {
  return new GoogleService(() => repo, deps);
}

describe('GoogleService (deep DI)', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('getGoogleConnection mapeia a conexão para o DTO público via repo injetado', async () => {
    const repo = makeRepo({ findGoogleConnection: vi.fn(async () => makeConnection()) });
    const svc = makeSvc(repo, makeDeps());

    const dto = await svc.getGoogleConnection('t1');

    expect(repo.findGoogleConnection).toHaveBeenCalled();
    expect(dto).toMatchObject({
      id: 'conn-1',
      googleUserId: 'g-user-1',
      accountId: 'accounts/111',
      connected: true,
    });
    expect(typeof dto?.tokenExpiresAt).toBe('string');
  });

  it('generateGoogleAuthUrl usa getGoogleOAuthConfig/state injetados (Sem token vazado)', () => {
    const deps = makeDeps();
    const svc = makeSvc(makeRepo(), deps);

    const url = svc.generateGoogleAuthUrl('t1', 'settings');

    expect(deps.oauth.getGoogleOAuthConfig).toHaveBeenCalled();
    const parsed = new URL(url);
    expect(parsed.searchParams.get('client_id')).toBe('cid');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app/cb');
    expect(parsed.searchParams.get('scope')).toContain('business.manage');
    expect(parsed.searchParams.get('state')).toBeTruthy();

    // State assinado é verificável de volta (round-trip de DI).
    const state = parsed.searchParams.get('state')!;
    expect((jwt.verify(state, 'test-secret') as any).tenantId).toBe('t1');
  });

  it('disconnectGoogleConnection decripta o token, revoga na Google e remove via repo', async () => {
    const repo = makeRepo({ findGoogleConnectionById: vi.fn(async () => makeConnection()) });
    const deps = makeDeps();
    const svc = makeSvc(repo, deps);

    const result = await svc.disconnectGoogleConnection('conn-1', 't1');

    expect(repo.findGoogleConnectionById).toHaveBeenCalledWith('conn-1');
    expect(deps.oauth.revokeGoogleToken).toHaveBeenCalledWith('plain-access-token');
    expect(repo.deleteGoogleConnection).toHaveBeenCalledWith('conn-1');
    expect(result).toEqual({ id: 'conn-1', disconnected: true });
  });

  it('handleGoogleOAuthCallback troca code→token via oauth injetado e faz upsert via repo', async () => {
    const idToken = jwt.sign({ sub: 'google-sub-1' }, 'test-secret');
    const deps = makeDeps({
      oauth: {
        exchangeCodeForToken: vi.fn(async () => ({
          access_token: 'at1',
          refresh_token: 'rt1',
          expires_in: 3600,
          id_token: idToken,
        })),
      },
    });
    const repo = makeRepo({ findGoogleConnection: vi.fn(async () => null) });
    const svc = makeSvc(repo, deps);

    const result = await svc.handleGoogleOAuthCallback('code-x', jwt.sign({ tenantId: 't1', context: 'settings' }, 'test-secret'));

    expect(deps.oauth.exchangeCodeForToken).toHaveBeenCalledWith('code-x');
    expect(repo.findGoogleConnection).toHaveBeenCalled();
    expect(repo.createGoogleConnection).toHaveBeenCalled();
    const created = repo.createGoogleConnection.mock.calls[0][0];
    expect(created.googleUserId).toBe('google-sub-1');
    expect(created.accessToken).not.toBe('at1'); // criptografado
    expect(result).toMatchObject({ tenantId: 't1', context: 'settings', returnUrl: '/configuracoes/google-meu-negocio?connected=true' });
  });

  it('addPhoto faz upload via storage injetado e persiste via repo', async () => {
    const profile = { id: 'p-1', connectionId: 'conn-1', gbpLocationId: 'loc-1', photos: ['https://old.jpg'] };
    const repo = makeRepo({
      getBusinessProfile: vi.fn(async () => profile),
      patchBusinessProfile: vi.fn(async () => undefined),
      createSyncLog: vi.fn(async () => undefined),
    });
    const deps = makeDeps();
    const svc = makeSvc(repo, deps);

    const result = await svc.addPhoto('p-1', 't1', Buffer.from('x'), 'foto.jpg', 'image/jpeg');

    expect(deps.storage.uploadAsset).toHaveBeenCalledWith(Buffer.from('x'), 'foto.jpg', 'image/jpeg');
    expect(repo.patchBusinessProfile).toHaveBeenCalled();
    const patch = repo.patchBusinessProfile.mock.calls[0][1] as any;
    expect(patch.photos).toEqual(['https://old.jpg', 'https://r2.example/photo.jpg']);
    expect(result.photos).toEqual(['https://old.jpg', 'https://r2.example/photo.jpg']);
    expect(result.associatedManually).toBe(true);
  });
});