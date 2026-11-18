/* Funcionalidade: enviar avaliação com banco migrado.
 * Dado imagem ou vídeo do tenant, quando envio nota, então persiste sem duplicidade.
 * Dado entrada ou contexto inválido, então rejeita sem gravar. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { db, tenants, users, creativeAssets, creativeAssetRatings } from '@fury/db';
import { StudioRatingController } from '../controllers/studio-rating.controller.js';
import { StudioRatingService } from '../services/studio/studio-rating.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { generateAccessToken } from '../lib/jwt.js';

// Opt-in: these tests create only their own fixtures in a migrated test database.
describe.skipIf(!process.env.TEST_RATING_DATABASE)('avaliação HTTP com PostgreSQL real', () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const assets = { image: randomUUID(), video: randomUUID() };
  const app = express();
  app.use(express.json());
  app.put('/studio/assets/:assetId/rating', authMiddleware, tenantMiddleware, new StudioRatingController(new StudioRatingService()).rate);
  app.use(errorHandler);
  const token = (tenant = tenantId) => generateAccessToken({ userId, tenantId: tenant, email: `${userId}@test.invalid`, role: 'member' });
  const send = (assetId: string, rating: unknown, auth = token()) => request(app).put(`/studio/assets/${assetId}/rating`).set('Authorization', `Bearer ${auth}`).send({ rating });

  beforeAll(async () => {
    await db.insert(tenants).values([{ id: tenantId, name: 'Rating test', slug: tenantId }, { id: otherTenantId, name: 'Other rating test', slug: otherTenantId }]);
    await db.insert(users).values({ id: userId, tenantId, email: `${userId}@test.invalid` });
    await db.insert(creativeAssets).values(Object.entries(assets).map(([type, id]) => ({ id, tenantId, type: type as 'image' | 'video', url: `https://example.com/${id}` })));
  });
  beforeEach(async () => {
    await db.delete(creativeAssetRatings).where(eq(creativeAssetRatings.tenantId, tenantId));
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(tenants).where(eq(tenants.id, otherTenantId));
  });
  it.each(['image', 'video'] as const)('Dado %s, quando cria e atualiza, então mantém uma linha e createdAt', async type => {
    const first = await send(assets[type], 5);
    expect(first.status).toBe(200);
    const second = await send(assets[type], 2);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ creativeAssetId: assets[type], rating: 2, createdAt: first.body.createdAt });
    const rows = await db.select().from(creativeAssetRatings).where(eq(creativeAssetRatings.creativeAssetId, assets[type]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId, userId, rating: 2 });
  });
  it('Dado envios concorrentes, então mantém a chave única', async () => {
    const responses = await Promise.all([send(assets.image, 3), send(assets.image, 4)]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const rows = await db.select().from(creativeAssetRatings).where(eq(creativeAssetRatings.creativeAssetId, assets.image));
    expect(rows).toHaveLength(1);
    expect([3, 4]).toContain(rows[0].rating);
  });
  it('Dado entrada/contexto inválidos, então retorna 400, 401, 403 e 404 sem inserir', async () => {
    expect((await send(assets.image, 6)).status).toBe(400);
    expect((await send(assets.image, '5')).status).toBe(400);
    expect((await send('invalid', 3)).status).toBe(400);
    expect((await request(app).put(`/studio/assets/${assets.image}/rating`).send({ rating: 3 })).status).toBe(401);
    expect((await send(assets.image, 3, token(otherTenantId))).status).toBe(403);
    expect((await send(randomUUID(), 3)).status).toBe(404);
    const rows = await db.select().from(creativeAssetRatings).where(eq(creativeAssetRatings.tenantId, tenantId));
    expect(rows).toHaveLength(0);
  });
});
