// =============================================================================
// Testes do publishNow/publishRetry (PlannerService) — endpoint publish-now.
// BDD unit: cria com claim 'publishing' → publica → published; falha → failed
// NA HORA (decisão: sem retry automático no postar agora — retry é clique);
// carousel recusado 400; sem conta IG → failed com motivo; retry republica o
// MESMO post via claim (approved/failed), published → 409.
// Padrão: import direto do PlannerService + DI via construtor
// (mesma receita do resolve-instagram.test.ts).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { PlannerService } from '../services/planner/planner.service.js';
import { AppError } from '../middleware/errorHandler.js';

/** Replica encryptToken (utils/crypto.ts) p/ token decryptável no teste. */
function encryptForTest(token: string): string {
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET ?? 'test-jwt-secret').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-jwt-secret';
});

function makeRepoFake(postOverrides: Record<string, any> = {}) {
  return {
    createPost: vi.fn(async (data: any) => ({
      id: 'post-new',
      publishAttempts: 0,
      status: data.status,
      ...data,
    })),
    findPostById: vi.fn(async () => ({
      id: 'post-1',
      postType: 'image',
      status: 'failed',
      publishAttempts: 1,
      caption: 'legenda',
      imageUrl: 'https://cdn.x/img.png',
      ...postOverrides,
    })),
    claimPostForPublish: vi.fn(async () => true),
    markPostPublished: vi.fn(async () => {}),
    markPostFailed: vi.fn(async () => {}),
    setPostRetry: vi.fn(async () => {}),
    findLatestMetaConnection: vi.fn(async () => ({
      id: 'conn-1',
      tenantId: 't1',
      accessToken: encryptForTest('meta-token'),
      selectedInstagramUserId: 'ig-1',
      selectedInstagramUsername: 'velora',
    })),
  };
}

function makeDeps(overrides: Record<string, any> = {}) {
  return {
    openrouter: {} as any,
    createInstagramMedia: vi.fn(async () => 'container-1'),
    getMediaContainerStatus: vi.fn(async () => 'FINISHED'),
    publishInstagramMedia: vi.fn(async () => 'media-1'),
    getUserFacebookPages: vi.fn(async () => [
      { pageId: 'p1', name: 'Velora', hasInstagram: true, instagramUserId: 'ig-1', instagramUsername: 'velora' },
    ]),
    ...overrides,
  };
}

const PAGES_OK = [
  { pageId: 'p1', name: 'Velora', hasInstagram: true, instagramUserId: 'ig-1', instagramUsername: 'velora' },
];

const PAYLOAD_IMAGE = { postType: 'image', caption: 'promo', imageUrl: 'https://cdn.x/img.png' };

describe('PlannerService.publishNow', () => {
  it('Cenário: image + conta IG vinculada → cria com claim publishing + lease, publica, markPostPublished, retorna published', async () => {
    const repo = makeRepoFake();
    const deps = makeDeps();
    const svc = new PlannerService(() => repo as never, deps as never);

    const result = await svc.publishNow('t1', PAYLOAD_IMAGE);

    // criação com claim
    expect(repo.createPost).toHaveBeenCalledTimes(1);
    const created = repo.createPost.mock.calls[0][0];
    expect(created.status).toBe('publishing');
    expect(created.scheduledAt).toBeInstanceOf(Date);
    expect((created as any).nextRetryAt).toBeInstanceOf(Date);
    expect(((created as any).nextRetryAt as Date).getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
    expect(created.tenantId).toBe('t1');
    expect(created.calendarDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // publicação no perfil AUTORIZADO
    expect(deps.createInstagramMedia).toHaveBeenCalledWith(
      'ig-1',
      expect.any(String),
      expect.objectContaining({ imageUrl: 'https://cdn.x/img.png' }),
    );
    expect(deps.publishInstagramMedia).toHaveBeenCalledWith('ig-1', expect.any(String), 'container-1');
    expect(repo.markPostPublished).toHaveBeenCalledWith('post-new', expect.any(Date), 'media-1', 1);

    expect(result.status).toBe('published');
    expect(result.platformPostId).toBe('media-1');
    expect(repo.markPostFailed).not.toHaveBeenCalled();
    expect(repo.setPostRetry).not.toHaveBeenCalled();
  });

  it('Cenário: erro da Graph API → markPostFailed NA HORA (attempts 1, mensagem), retorna failed, sem setPostRetry', async () => {
    const repo = makeRepoFake();
    const deps = makeDeps({ publishInstagramMedia: vi.fn(async () => { throw new Error('Graph API: boom'); }) });
    const svc = new PlannerService(() => repo as never, deps as never);

    const result = await svc.publishNow('t1', PAYLOAD_IMAGE);

    expect(repo.markPostFailed).toHaveBeenCalledWith('post-new', 1, 'Graph API: boom', expect.any(Date));
    expect(repo.setPostRetry).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
    expect(result.lastPublishError).toBe('Graph API: boom');
  });

  it('Cenário: carousel → AppError 400 CAROUSEL_NOT_SUPPORTED, nada é criado', async () => {
    const repo = makeRepoFake();
    const svc = new PlannerService(() => repo as never, makeDeps() as never);

    await expect(svc.publishNow('t1', { postType: 'carousel', imageUrls: ['a', 'b'] }))
      .rejects.toMatchObject({ statusCode: 400, code: 'CAROUSEL_NOT_SUPPORTED' });
    expect(repo.createPost).not.toHaveBeenCalled();
  });

  it('Cenário: sem Instagram vinculado → falha segura: post failed com motivo, nenhuma chamada à Graph API', async () => {
    const repo = makeRepoFake();
    repo.findLatestMetaConnection.mockResolvedValue({
      id: 'conn-1', tenantId: 't1', accessToken: encryptForTest('meta-token'),
      selectedInstagramUserId: null, // NÃO vinculado
    } as any);
    const deps = makeDeps();
    const svc = new PlannerService(() => repo as never, deps as never);

    const result = await svc.publishNow('t1', PAYLOAD_IMAGE);

    expect(deps.createInstagramMedia).not.toHaveBeenCalled();
    expect(repo.markPostFailed).toHaveBeenCalledWith(
      'post-new', 1, expect.stringContaining('no_instagram_account'), expect.any(Date),
    );
    expect(result.status).toBe('failed');
  });

  it('Cenário: conta IG vinculada mas revogada (página sai de /me/accounts) → failed, não publica em outra conta', async () => {
    const repo = makeRepoFake();
    const deps = makeDeps({
      getUserFacebookPages: vi.fn(async () => [
        { pageId: 'p9', name: 'Outra', hasInstagram: true, instagramUserId: 'ig-OUTRA', instagramUsername: 'outra' },
      ]),
    });
    const svc = new PlannerService(() => repo as never, deps as never);

    const result = await svc.publishNow('t1', PAYLOAD_IMAGE);
    expect(deps.createInstagramMedia).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });
});

describe('PlannerService.publishRetry', () => {
  it('Cenário: post failed → claim ganho, publica o MESMO post (sem criar outro), retorna published', async () => {
    const repo = makeRepoFake();
    const deps = makeDeps();
    const svc = new PlannerService(() => repo as never, deps as never);

    const result = await svc.publishRetry('t1', 'post-1');

    expect(repo.claimPostForPublish).toHaveBeenCalledWith('post-1');
    expect(repo.createPost).not.toHaveBeenCalled();
    expect(deps.publishInstagramMedia).toHaveBeenCalled();
    expect(repo.markPostPublished).toHaveBeenCalledWith('post-1', expect.any(Date), 'media-1', 2);
    expect(result.id).toBe('post-1');
    expect(result.status).toBe('published');
  });

  it('Cenário: claim perdido (published/publishing fresco) → AppError 409 POST_CLAIMED', async () => {
    const repo = makeRepoFake();
    repo.claimPostForPublish.mockResolvedValue(false);
    const svc = new PlannerService(() => repo as never, makeDeps() as never);

    await expect(svc.publishRetry('t1', 'post-1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'POST_CLAIMED' });
    expect(repo.markPostPublished).not.toHaveBeenCalled();
  });

  it('Cenário: retry que falha de novo → markPostFailed com attempts incrementado', async () => {
    const repo = makeRepoFake();
    const deps = makeDeps({ publishInstagramMedia: vi.fn(async () => { throw new Error('Graph API: boom 2'); }) });
    const svc = new PlannerService(() => repo as never, deps as never);

    const result = await svc.publishRetry('t1', 'post-1');
    expect(repo.markPostFailed).toHaveBeenCalledWith('post-1', 2, 'Graph API: boom 2', expect.any(Date));
    expect(result.status).toBe('failed');
  });
});
