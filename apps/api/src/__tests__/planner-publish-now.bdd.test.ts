// =============================================================================
// BDD — POST /planner/posts/publish-now (route-level, supertest, T007)
//
/*
# Language: pt-BR

Funcionalidade: Postar agora (publicação imediata idempotente)

  Cenário: publicar imagem com Instagram vinculado
    Dado usuário autenticado com Instagram vinculado
    Quando POST /planner/posts/publish-now com payload válido e Idempotency-Key
    Então a resposta é 201 com data.status 'published' e platformPostId

  Cenário: carrossel não suportado
    Dado usuário autenticado
    Quando o payload é postType 'carousel'
    Então a resposta é 400 com código CAROUSEL_NOT_SUPPORTED

  Cenário: sem Idempotency-Key
    Dado usuário autenticado
    Quando a requisição NÃO tem o header Idempotency-Key
    Então a resposta é 400 com código IDEMPOTENCY_KEY_REQUIRED (middleware antes do handler)

  Cenário: replay estrito
    Dado que a 1ª requisição com a key K foi respondida
    Quando a mesma key K chega de novo
    Então a resposta é IDÊNTICA (status + body) e o handler não roda de novo

  Cenário: key em andamento
    Dado que existe requisição em voo com a key K (inflight no Redis)
    Quando outra requisição chega com a mesma key
    Então a resposta é 409 IDEMPOTENCY_REQUEST_IN_PROGRESS

  Cenário: Redis indisponível
    Dado que o Redis está inacessível
    Quando uma requisição chega com key
    Então a resposta é 503 IDEMPOTENCY_STORE_UNAVAILABLE (fail-closed)

  Cenário: retry de post já publicado
    Dado post já published
    Quando publish-now com { retryPostId }
    Então a resposta é 409 POST_CLAIMED

  Cenário: retry de post failed
    Dado post failed
    Quando publish-now com { retryPostId }
    Então a resposta é 201 com o MESMO id do post

  Cenário: sem autenticação / post inexistente (baseline)
    Quando requisição sem Authorization → 401
    Quando retryPostId de post que não existe → 404 NOT_FOUND
*/
//
// Receita: fury-api-testing/references/bdd-google-route-test.md — router REAL
// (auth + tenant + idempotency + errorHandler reais); di.js mockado trocando
// SÓ o planner controller; Redis substituído por fake in-memory fiel ao ioredis.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import express from 'express';

// ── Fake Redis in-memory, fiel ao ioredis (NX real) + failMode p/ 503 ──────
const { fakeStore, failMode, fakeRedis, mockPlannerService } = vi.hoisted(() => {
  const fakeStore = new Map<string, string>();
  const failMode = { enabled: false };
  const fail = () => Promise.reject(new Error('ECONNREFUSED: redis down'));
  const fakeRedis = {
    get: vi.fn(async (k: string) => (failMode.enabled ? fail() : fakeStore.get(k) ?? null)),
    set: vi.fn(async (k: string, v: string, ...rest: unknown[]) => {
      if (failMode.enabled) return fail();
      if (rest[2] !== 'NX') { fakeStore.set(k, v); return 'OK'; }
      if (fakeStore.has(k)) return null;
      fakeStore.set(k, v);
      return 'OK';
    }),
    del: vi.fn(async (k: string) => { fakeStore.delete(k); return 1; }),
  };
  const mockPlannerService = { publishNow: vi.fn(), publishRetry: vi.fn() };
  return { fakeStore, failMode, fakeRedis, mockPlannerService };
});

vi.mock('../lib/redis.js', () => ({ getRedis: () => fakeRedis }));
vi.mock('../workers/planner.worker.js', () => ({ enqueuePlanGeneration: vi.fn() }));
vi.mock('../lib/analytics.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  captureServerException: vi.fn(),
}));

// di.js real com SÓ o planner controller trocado (service mockado)
vi.mock('../di.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  const { PlannerController } = await import('../controllers/planner.controller.js');
  return {
    ...actual,
    controllers: { ...actual.controllers, planner: new PlannerController(mockPlannerService as never) },
  };
});

import plannerRoutes from '../routes/planner.routes.js';
import { errorHandler, AppError } from '../middleware/errorHandler.js';

const UUID_OK = '123e4567-e89b-12d3-a456-426614174000';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/planner', plannerRoutes);
  app.use(errorHandler);
  return app;
}

function authToken(tenantId = 't1'): string {
  return jwt.sign(
    { userId: 'user-1', tenantId, email: 'diogommtdes@gmail.com', role: 'owner' },
    process.env.JWT_SECRET ?? 'test-jwt-secret',
  );
}

const RESULT_PUBLISHED = { id: UUID_OK, status: 'published', platformPostId: 'media-1', instagramUsername: 'velora' };
const RESULT_FAILED = { id: UUID_OK, status: 'failed', lastPublishError: 'Graph API: erro' };

beforeEach(() => {
  fakeStore.clear();
  failMode.enabled = false;
  vi.clearAllMocks();
  mockPlannerService.publishNow.mockResolvedValue(RESULT_PUBLISHED);
  mockPlannerService.publishRetry.mockResolvedValue(RESULT_PUBLISHED);
});

describe('BDD: Postar agora — POST /api/planner/posts/publish-now', () => {
  const app = buildApp();
  const url = '/api/planner/posts/publish-now';

  it('Cenário: publicar imagem com Instagram vinculado → 201 published', async () => {
    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Idempotency-Key', 'key-happy')
      .send({ postType: 'image', caption: 'promo', imageUrl: 'https://cdn.x/img.png' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('published');
    expect(res.body.data.platformPostId).toBe('media-1');
    expect(mockPlannerService.publishNow).toHaveBeenCalledWith('t1', expect.objectContaining({ postType: 'image' }));
  });

  it('Cenário: carrossel não suportado → 400 CAROUSEL_NOT_SUPPORTED', async () => {
    // (service mockado: o AppError 400 é exatamente o que o service real lança
    // — coberto no unit planner-publish-now.test.ts cenário carousel)
    mockPlannerService.publishNow.mockRejectedValue(new AppError(400, 'CAROUSEL_NOT_SUPPORTED', 'Carrossel ainda não é suportado no "Postar agora". Crie um post único ou agende.'));

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Idempotency-Key', 'key-carousel')
      .send({ postType: 'carousel', imageUrls: ['https://cdn.x/a.png', 'https://cdn.x/b.png'] });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('CAROUSEL_NOT_SUPPORTED');
  });

  it('Cenário: sem Idempotency-Key → 400 IDEMPOTENCY_KEY_REQUIRED (handler nunca roda)', async () => {
    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ postType: 'image', imageUrl: 'https://cdn.x/img.png' });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(mockPlannerService.publishNow).not.toHaveBeenCalled();
  });

  it('Cenário: replay estrito → 2ª req com a mesma key devolve a MESMA resposta e o handler roda 1x', async () => {
    const first = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Idempotency-Key', 'key-replay')
      .send({ postType: 'image', imageUrl: 'https://cdn.x/img.png' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Idempotency-Key', 'key-replay')
      .send({ postType: 'image', imageUrl: 'https://cdn.x/img.png' });

    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(mockPlannerService.publishNow).toHaveBeenCalledTimes(1);
  });

  it('Cenário: key em andamento → 409 IDEMPOTENCY_REQUEST_IN_PROGRESS', async () => {
    fakeStore.set('idem:publish-now:t1:key-busy', '1'); // inflight pré-existente

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Idempotency-Key', 'key-busy')
      .send({ postType: 'image', imageUrl: 'https://cdn.x/img.png' });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('IDEMPOTENCY_REQUEST_IN_PROGRESS');
  });

  it('Cenário: Redis indisponível → 503 IDEMPOTENCY_STORE_UNAVAILABLE (fail-closed)', async () => {
    failMode.enabled = true;

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Idempotency-Key', 'key-down')
      .send({ postType: 'image', imageUrl: 'https://cdn.x/img.png' });

    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe('IDEMPOTENCY_STORE_UNAVAILABLE');
  });

  it('Cenário: retry de post já publicado → 409 POST_CLAIMED', async () => {
    mockPlannerService.publishRetry.mockRejectedValue(new AppError(409, 'POST_CLAIMED', 'não republica'));

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Idempotency-Key', 'key-retry-1')
      .send({ retryPostId: UUID_OK });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('POST_CLAIMED');
    expect(mockPlannerService.publishRetry).toHaveBeenCalledWith('t1', UUID_OK);
  });

  it('Cenário: retry de post failed → 201 com o MESMO id', async () => {
    mockPlannerService.publishRetry.mockResolvedValue(RESULT_PUBLISHED);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Idempotency-Key', 'key-retry-2')
      .send({ retryPostId: UUID_OK });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(UUID_OK);
    expect(res.body.data.status).toBe('published');
    expect(mockPlannerService.publishNow).not.toHaveBeenCalled();
  });

  it('Cenário (baseline): sem autenticação → 401; post inexistente no retry → 404 NOT_FOUND', async () => {
    const noAuth = await request(app)
      .post(url)
      .set('Idempotency-Key', 'key-noauth')
      .send({ postType: 'image' });
    expect(noAuth.status).toBe(401);
    expect(mockPlannerService.publishNow).not.toHaveBeenCalled();

    mockPlannerService.publishRetry.mockRejectedValue(new AppError(404, 'NOT_FOUND', 'Post não encontrado'));
    const notFound = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${authToken()}`)
      .set('Idempotency-Key', 'key-404')
      .send({ retryPostId: UUID_OK });
    expect(notFound.status).toBe(404);
    expect(notFound.body.error?.code).toBe('NOT_FOUND');
  });
});
