/**
 * Testes das rotas Ads (Fluxo 3 — F3.5).
 *
 * Segue o padrão de google-profile-quality.route.test.ts: router+controller
 * reais, service mockado via di.js, JWT válido, errorHandler real.
 *
 * Cobre POST /profiles/:id/ads/campaign (verba mensal), pause e status,
 * incluindo validação Zod da verba, 401 sem token e 400 com id inválido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockGoogleService = vi.hoisted(() => ({
  criarCampanhaAds: vi.fn(),
  pauseCampanhaAds: vi.fn(),
  getAdsCampaignStatus: vi.fn(),
}));

vi.mock('../di.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../di.js')>();
  const { GoogleController } = await import('../controllers/google.controller.js');
  return {
    ...actual,
    controllers: { ...actual.controllers, google: new GoogleController(mockGoogleService as never) },
  };
});

vi.mock('../lib/analytics.js', () => ({
  captureServerException: vi.fn(),
}));

import { errorHandler } from '../middleware/errorHandler.js';
import googleRoutes from '../routes/google.routes.js';

const VALID_TOKEN = jwt.sign(
  { userId: 'u-1', tenantId: 't-1', email: 'diogommtdes@gmail.com', role: 'admin' },
  process.env.JWT_SECRET ?? 'test-jwt-secret-min-32-characters-long-aaaa'
);

const PROFILE_UUID = '123e4567-e89b-12d3-a456-426614174000';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/google', googleRoutes);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGoogleService.criarCampanhaAds.mockResolvedValue({ campaignId: 999, budgetId: 555, assetSetId: 111 });
  mockGoogleService.pauseCampanhaAds.mockResolvedValue({ paused: true, status: 'PAUSED' });
  mockGoogleService.getAdsCampaignStatus.mockResolvedValue({
    campaignId: '999', status: 'ENABLED', monthlyBudgetBRL: '300.00', dailyBudgetMicros: 9_863_013, lastServedAt: null,
  });
});

describe('POST /api/google/profiles/:id/ads/campaign', () => {
  it('cria campanha com verba mensal válida (201)', async () => {
    const res = await request(buildTestApp())
      .post(`/api/google/profiles/${PROFILE_UUID}/ads/campaign`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ monthlyBudgetBRL: 300 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.campaignId).toBe(999);
    expect(mockGoogleService.criarCampanhaAds).toHaveBeenCalledWith(PROFILE_UUID, 't-1', 300);
  });

  it('rejeita verba abaixo do mínimo (400)', async () => {
    const res = await request(buildTestApp())
      .post(`/api/google/profiles/${PROFILE_UUID}/ads/campaign`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ monthlyBudgetBRL: 10 });

    expect(res.status).toBe(400);
    expect(mockGoogleService.criarCampanhaAds).not.toHaveBeenCalled();
  });

  it('rejeita verba ausente (400)', async () => {
    const res = await request(buildTestApp())
      .post(`/api/google/profiles/${PROFILE_UUID}/ads/campaign`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('retorna 401 sem token', async () => {
    const res = await request(buildTestApp())
      .post(`/api/google/profiles/${PROFILE_UUID}/ads/campaign`)
      .send({ monthlyBudgetBRL: 300 });

    expect(res.status).toBe(401);
  });

  it('retorna 400 com id não-uuid', async () => {
    const res = await request(buildTestApp())
      .post('/api/google/profiles/nao-uuid/ads/campaign')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ monthlyBudgetBRL: 300 });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/google/profiles/:id/ads/status', () => {
  it('retorna status da campanha', async () => {
    const res = await request(buildTestApp())
      .get(`/api/google/profiles/${PROFILE_UUID}/ads/status`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ENABLED');
  });
});

describe('POST /api/google/profiles/:id/ads/campaign/pause', () => {
  it('pausa a campanha', async () => {
    const res = await request(buildTestApp())
      .post(`/api/google/profiles/${PROFILE_UUID}/ads/campaign/pause`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.paused).toBe(true);
  });
});