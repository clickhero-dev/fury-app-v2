// =============================================================================
// INTEGRAÇÃO — POST /planner/posts/publish-now (banco REAL + rotas REAIS)
//
// Reproduz o cenário de docs/issues/erro-publish-now.md: a Graph API recusa a
// publicação ([Meta API] 25: User access is restricted) e o endpoint deve
// responder HTTP 201 com data.status='failed' e lastPublishError preservado,
// persistindo o post como 'failed' no banco (social_posts).
//
// Garantias cobertas aqui (não cobertas pelos unit/BDD existentes):
//  1. Erro da Graph API → 201 + status failed + lastPublishError real, sem 500
//  2. Post persistido com status 'failed' e lastPublishError no banco real
//  3. Happy path → 201 + published + platformPostId persistido
//  4. Erro 9007 (stories — container ainda processando) → 201 + failed
//  5. Replay da MESMA Idempotency-Key NÃO republica (a falha não duplica)
//  6. Retry (key nova + retryPostId) após falha → republica o MESMO post
//  7. Tenant sem Instagram vinculado → 201 failed com no_instagram_account
//
// Banco real (fury_test) + router real (auth/tenant/idempotency/errorHandler)
// + service real + repository real. Únicos mocks: Graph API externa
// (meta-api.ts) e Redis (adapter de borda da idempotência).
// Receita: fury-api-testing/references/google-profile-flow.test.ts
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// ── Mocks de borda (Graph API + Redis) — todo o resto é REAL ────────────────

const {
  mockCreateInstagramMedia,
  mockGetMediaContainerStatus,
  mockPublishInstagramMedia,
  mockGetUserFacebookPages,
  fakeStore,
  fakeRedis,
} = vi.hoisted(() => {
  const fakeStore = new Map<string, string>();
  const fakeRedis = {
    get: vi.fn(async (k: string) => fakeStore.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, ...rest: unknown[]) => {
      // ioredis: SET key val EX ttl NX — último arg 'NX' ⇒ condicional
      if (rest[2] !== 'NX') { fakeStore.set(k, v); return 'OK'; }
      if (fakeStore.has(k)) return null;
      fakeStore.set(k, v);
      return 'OK';
    }),
    del: vi.fn(async (k: string) => { fakeStore.delete(k); return 1; }),
  };
  return {
    mockCreateInstagramMedia: vi.fn(),
    mockGetMediaContainerStatus: vi.fn(),
    mockPublishInstagramMedia: vi.fn(),
    mockGetUserFacebookPages: vi.fn(),
    fakeStore,
    fakeRedis,
  };
});

// Graph API externa: substitui SÓ as funções usadas pelo publish-now
// (createInstagramMedia / getMediaContainerStatus / publishInstagramMedia /
// getUserFacebookPages); preserva as demais exports do módulo.
vi.mock('../lib/meta-api.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createInstagramMedia: mockCreateInstagramMedia,
    getMediaContainerStatus: mockGetMediaContainerStatus,
    publishInstagramMedia: mockPublishInstagramMedia,
    getUserFacebookPages: mockGetUserFacebookPages,
  };
});

// Redis (idempotência) → fake in-memory fiel ao ioredis
vi.mock('../lib/redis.js', () => ({ getRedis: () => fakeRedis }));

// worker que depende de BullMQ/Redis — não é usado por publish-now
vi.mock('../workers/planner.worker.js', () => ({ enqueuePlanGeneration: vi.fn() }));

// analytics → stub (não envia para Sentry em teste)
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));

import { db, socialPosts, metaConnections } from '@fury/db';
import { eq } from 'drizzle-orm';
import { encryptToken } from '../utils/crypto.js';
import { createTestTenant, createTestUser, cleanupDatabase, type TestUser } from './utils/test-helpers.js';
import plannerRoutes from '../routes/planner.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

const PAGES_OK = [
  { pageId: 'p1', name: 'Velora', hasInstagram: true, instagramUserId: 'ig-1', instagramUsername: 'velora' },
];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/planner', plannerRoutes);
  app.use(errorHandler);
  return app;
}

async function lastPostFor(tenantId: string) {
  const rows = await db.select().from(socialPosts).where(eq(socialPosts.tenantId, tenantId));
  return rows[rows.length - 1] ?? null;
}

describe('INTEGRAÇÃO: POST /planner/posts/publish-now — garantia do erro Meta (issue docs/issues/erro-publish-now.md)', () => {
  let app: ReturnType<typeof buildApp>;
  let tenantId: string;
  let user: TestUser;

  const META_ERROR_25 = '[Meta API] 25: User access is restricted';
  const META_ERROR_9007 = '[Meta API] 9007: Media ID is not available';

  beforeAll(async () => {
    app = buildApp();

    // Tenant com Instagram vinculado (selectedInstagramUserId preenchido)
    const tenant = await createTestTenant('publish-now-integration');
    tenantId = tenant.id;
    user = await createTestUser(tenantId, 'publish-now@test.com');

    await db.insert(metaConnections).values({
      tenantId,
      metaUserId: 'meta-user-1',
      accessToken: encryptToken('meta-access-token'),
      selectedInstagramUserId: 'ig-1',
    });

    // Resolve a conta autorizada via /me/accounts
    mockGetUserFacebookPages.mockResolvedValue(PAGES_OK);
    // Container sempre criado; o publish decide sucesso/erro
    mockCreateInstagramMedia.mockResolvedValue('container-1');
    mockGetMediaContainerStatus.mockResolvedValue('FINISHED');
    mockPublishInstagramMedia.mockResolvedValue('media-1');
  });

  afterAll(cleanupDatabase);

  beforeEach(() => {
    fakeStore.clear();
    vi.clearAllMocks();
    mockGetUserFacebookPages.mockResolvedValue(PAGES_OK);
    mockCreateInstagramMedia.mockResolvedValue('container-1');
    mockGetMediaContainerStatus.mockResolvedValue('FINISHED');
    mockPublishInstagramMedia.mockResolvedValue('media-1');
  });

  const url = '/api/planner/posts/publish-now';
  // lê o token no momento da chamada (user é definido no beforeAll)
  const auth = () => ({ Authorization: `Bearer ${user.token}` });
  const payload = { postType: 'image', caption: 'promo', imageUrl: 'https://cdn.x/img.png' };

  it("Cenário do issue: Graph API recusa (erro 25) → 201 + status failed + lastPublishError real e post 'failed' no banco", async () => {
    mockPublishInstagramMedia.mockRejectedValue(new Error(META_ERROR_25));

    const res = await request(app)
      .post(url)
      .set(auth())
      .set('Idempotency-Key', 'key-meta-25')
      .send(payload);

    // HTTP 201 (desfecho em data.status) — NUNCA 500
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('failed');
    expect(res.body.data.lastPublishError).toBe(META_ERROR_25);

    // Persistência real no banco
    const post = await db.query.socialPosts.findFirst({
      where: eq(socialPosts.id, res.body.data.id),
    });
    expect(post).not.toBeNull();
    expect(post!.status).toBe('failed');
    expect(post!.lastPublishError).toBe(META_ERROR_25);
    expect(post!.publishAttempts).toBe(1);
  });

  it('Happy path: Graph API ok → 201 + status published + platformPostId persistido', async () => {
    const res = await request(app)
      .post(url)
      .set(auth())
      .set('Idempotency-Key', 'key-happy')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('published');
    expect(res.body.data.platformPostId).toBe('media-1');

    const post = await db.query.socialPosts.findFirst({
      where: eq(socialPosts.id, res.body.data.id),
    });
    expect(post!.status).toBe('published');
    expect(post!.platformPostId).toBe('media-1');
  });

  it("Cenário do issue #2: stories + Graph API responde 9007 (container ainda processando) → 201 + failed + erro preservado", async () => {
    mockPublishInstagramMedia.mockRejectedValue(new Error(META_ERROR_9007));

    const res = await request(app)
      .post(url)
      .set(auth())
      .set('Idempotency-Key', 'key-meta-9007')
      .send({ postType: 'stories', caption: 'aloo', imageUrl: 'https://pub-d99df9e660d547ae86921f86e8353d9e.r2.dev/f0a373f5-e49b-42f8-86c0-4240dbbebedc.png' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('failed');
    expect(res.body.data.lastPublishError).toBe(META_ERROR_9007);

    const post = await db.query.socialPosts.findFirst({
      where: eq(socialPosts.id, res.body.data.id),
    });
    expect(post!.status).toBe('failed');
    expect(post!.lastPublishError).toBe(META_ERROR_9007);
  });

  it('Replay da MESMA key após falha → resposta IDÊNTICA e a Graph API NÃO é chamada de novo', async () => {
    mockPublishInstagramMedia.mockRejectedValue(new Error(META_ERROR_25));

    const first = await request(app)
      .post(url)
      .set(auth())
      .set('Idempotency-Key', 'key-replay-fail')
      .send(payload);
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe('failed');

    const callsAfterFirst = mockPublishInstagramMedia.mock.calls.length;

    const second = await request(app)
      .post(url)
      .set(auth())
      .set('Idempotency-Key', 'key-replay-fail')
      .send(payload);

    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    // replay estrito: handler não roda de novo → Meta não é chamada de novo
    expect(mockPublishInstagramMedia.mock.calls.length).toBe(callsAfterFirst);
  });

  it('Retry após falha (key nova + retryPostId) → republica o MESMO post com sucesso', async () => {
    // 1ª tentativa falha (erro 25)
    mockPublishInstagramMedia.mockRejectedValue(new Error(META_ERROR_25));
    const failed = await request(app)
      .post(url)
      .set(auth())
      .set('Idempotency-Key', 'key-retry-first')
      .send(payload);
    expect(failed.body.data.status).toBe('failed');
    const postId = failed.body.data.id;

    // 2ª tentativa (Tentar novamente): Meta voltou → publica o mesmo post
    mockPublishInstagramMedia.mockResolvedValue('media-9');
    const retried = await request(app)
      .post(url)
      .set(auth())
      .set('Idempotency-Key', 'key-retry-second')
      .send({ retryPostId: postId });

    expect(retried.status).toBe(201);
    expect(retried.body.data.id).toBe(postId);
    expect(retried.body.data.status).toBe('published');

    const post = await db.query.socialPosts.findFirst({
      where: eq(socialPosts.id, postId),
    });
    expect(post!.status).toBe('published');
    expect(post!.platformPostId).toBe('media-9');
    // SÓ UMA linha criada (retry não duplica o post)
    const all = await db.select().from(socialPosts).where(eq(socialPosts.id, postId));
    expect(all).toHaveLength(1);
  });

  it('Tenant sem Instagram vinculado → 201 failed com no_instagram_account (nenhuma chamada à Graph API)', async () => {
    const noIgTenant = await createTestTenant('publish-now-no-ig');
    const noIgUser = await createTestUser(noIgTenant.id, 'no-ig@test.com');

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${noIgUser.token}`)
      .set('Idempotency-Key', 'key-no-ig')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('failed');
    expect(res.body.data.lastPublishError).toContain('no_instagram_account');
    expect(mockCreateInstagramMedia).not.toHaveBeenCalled();
    expect(mockPublishInstagramMedia).not.toHaveBeenCalled();
  });
});