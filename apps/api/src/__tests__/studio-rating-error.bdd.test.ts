/* Funcionalidade: erro inesperado ao avaliar.
 * Dado falha SQL, quando o endpoint falha, então retorna 500 sem SQL ou parâmetros. */
import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { StudioRatingController } from '../controllers/studio-rating.controller.js';
import { errorHandler } from '../middleware/errorHandler.js';

afterEach(() => vi.restoreAllMocks());
it('Dado falha SQL, então retorna erro client-safe que permite tentar novamente', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const service = { rate: vi.fn().mockRejectedValue(new Error('SQL INSERT creative_asset_ratings params: sensitive-user-id')) };
  const app = express();
  app.use(express.json());
  app.put('/studio/assets/:assetId/rating', (req, _res, next) => {
    Object.assign(req, { tenant: { tenantId: 'test' }, user: { userId: 'test' } });
    next();
  }, new StudioRatingController(service as never).rate);
  app.use(errorHandler);
  const response = await request(app).put('/studio/assets/11111111-1111-4111-8111-111111111111/rating').send({ rating: 4 });
  expect(response.status).toBe(500);
  expect(response.body).toMatchObject({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Erro no servidor. Tente de novo; se continuar, fale com o suporte.' } });
  expect(response.text).not.toMatch(/SQL|creative_asset_ratings|sensitive-user-id|stack/);
});
