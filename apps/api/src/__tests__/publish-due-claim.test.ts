// =============================================================================
// Testes do claim no scheduler publish-due (T005).
// Garantia: publishDuePosts NÃO publica sem ganhar o claim atômico — o trigger
// manual (publish-now) e o scheduler disputam o mesmo post, e só um publica.
// Perdeu claim ⇒ pula o post SEM marcar failed (não punir quem não é dono).
// Padrão: import direto do PlannerService + DI via construtor.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { PlannerService } from '../services/planner/planner.service.js';

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

const DUE_POST = {
  id: 'post-due-1',
  postType: 'image',
  caption: 'post vencido',
  imageUrl: 'https://cdn.x/img.png',
  status: 'approved',
  publishAttempts: 0,
  scheduledAt: new Date(Date.now() - 60_000),
};

function makeRepoFake(duePosts: any[] = [DUE_POST]) {
  return {
    findLatestMetaConnection: vi.fn(async () => ({
      id: 'conn-1', tenantId: 't1', accessToken: encryptForTest('meta-token'),
      selectedInstagramUserId: 'ig-1', selectedInstagramUsername: 'velora',
    })),
    listDuePosts: vi.fn(async () => duePosts),
    claimPostForPublish: vi.fn(async () => true),
    markPostPublished: vi.fn(async () => {}),
    markPostFailed: vi.fn(async () => {}),
    setPostRetry: vi.fn(async () => {}),
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

describe('publishDuePosts — claim atômico por post', () => {
  it('Cenário: ganha o claim → publica e marca published', async () => {
    const repo = makeRepoFake();
    const deps = makeDeps();
    const svc = new PlannerService(() => repo as never, deps as never);

    const result = await svc.publishDuePosts('t1');

    expect(repo.claimPostForPublish).toHaveBeenCalledWith('post-due-1');
    expect(deps.publishInstagramMedia).toHaveBeenCalled();
    expect(repo.markPostPublished).toHaveBeenCalledWith('post-due-1', expect.any(Date), 'media-1', 1);
    expect(result.published).toBe(1);
  });

  it('Cenário: PERDE o claim (trigger manual publicou primeiro) → pula o post, não publica, NÃO marca failed', async () => {
    const repo = makeRepoFake();
    repo.claimPostForPublish.mockResolvedValue(false);
    const deps = makeDeps();
    const svc = new PlannerService(() => repo as never, deps as never);

    const result = await svc.publishDuePosts('t1');

    expect(repo.claimPostForPublish).toHaveBeenCalledWith('post-due-1');
    expect(deps.createInstagramMedia).not.toHaveBeenCalled();
    expect(deps.publishInstagramMedia).not.toHaveBeenCalled();
    expect(repo.markPostPublished).not.toHaveBeenCalled();
    expect(repo.markPostFailed).not.toHaveBeenCalled();
    expect(repo.setPostRetry).not.toHaveBeenCalled();
    expect(result.published).toBe(0);
  });

  it('Cenário: post de tipo não suportado (carousel) → nem tenta o claim', async () => {
    const repo = makeRepoFake([
      { ...DUE_POST, id: 'post-carousel', postType: 'carousel' },
    ]);
    const deps = makeDeps();
    const svc = new PlannerService(() => repo as never, deps as never);

    await svc.publishDuePosts('t1');

    expect(repo.claimPostForPublish).not.toHaveBeenCalled();
    expect(deps.publishInstagramMedia).not.toHaveBeenCalled();
  });

  it('Cenário: falha APÓS ganhar o claim → fluxo normal de retry/falha (quem publicou é responsável)', async () => {
    const repo = makeRepoFake();
    const deps = makeDeps({ publishInstagramMedia: vi.fn(async () => { throw new Error('Graph API: boom'); }) });
    const svc = new PlannerService(() => repo as never, deps as never);

    await svc.publishDuePosts('t1');

    expect(repo.setPostRetry).toHaveBeenCalledWith('post-due-1', 1, 'Graph API: boom', expect.any(Date), expect.any(Date));
    expect(repo.markPostFailed).not.toHaveBeenCalled(); // 1ª tentativa → retry, não falha final
  });
});
