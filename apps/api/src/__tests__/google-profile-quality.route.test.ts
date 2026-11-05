/**
 * Testes da rota GET /api/google/profiles/:id/quality (avaliação de qualidade
 * do perfil GBP, pré-envio). Cobre: happy path com relatório, 401 sem token,
 * 400 com id não-uuid, 404 quando perfil/conexão não existe.
 * Router google real + GoogleController real (service mockado) + errorHandler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppError } from '../middleware/errorHandler.js';
import type { GoogleQualityReport } from '../services/google/google.service.js';

const mockGoogleService = vi.hoisted(() => ({
  assessProfile: vi.fn(),
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

const REPORT: GoogleQualityReport = {
  score: 95,
  grade: 'EXCELLENT',
  complete: true,
  verified: true,
  outdated: false,
  lastUpdated: '2026-07-01T12:00:00Z',
  missingFields: [],
  recommendations: [],
  warnings: [],
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/google', googleRoutes);
  app.use(errorHandler);
  return app;
}

describe('GET /api/google/profiles/:id/quality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGoogleService.assessProfile.mockReset();
  });

  it('200: devolve o relatório de qualidade do perfil autenticado', async () => {
    mockGoogleService.assessProfile.mockResolvedValue(REPORT);
    const app = buildApp();

    const res = await request(app)
      .get(`/api/google/profiles/${PROFILE_UUID}/quality`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(mockGoogleService.assessProfile).toHaveBeenCalledWith(PROFILE_UUID, 't-1');
    expect(res.body.success).toBe(true);
    expect(res.body.data.grade).toBe('EXCELLENT');
    expect(res.body.data.score).toBe(95);
    expect(res.body.data.warnings).toEqual([]);
  });

  it('401: sem token o middleware de auth bloqueia antes do service', async () => {
    const app = buildApp();

    const res = await request(app).get(`/api/google/profiles/${PROFILE_UUID}/quality`);

    expect(res.status).toBe(401);
    expect(mockGoogleService.assessProfile).not.toHaveBeenCalled();
  });

  it('400: id não-uuid é rejeitado pela validação do schema', async () => {
    const app = buildApp();

    const res = await request(app)
      .get('/api/google/profiles/not-a-uuid/quality')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(400);
    expect(mockGoogleService.assessProfile).not.toHaveBeenCalled();
  });

  it('404: perfil inexistente propaga AppError do service', async () => {
    mockGoogleService.assessProfile.mockRejectedValue(
      new AppError(404, 'NOT_FOUND', 'Perfil não encontrado.')
    );
    const app = buildApp();

    const res = await request(app)
      .get(`/api/google/profiles/${PROFILE_UUID}/quality`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('404: sem conexão Google propaga AppError do service', async () => {
    mockGoogleService.assessProfile.mockRejectedValue(
      new AppError(404, 'NOT_FOUND', 'Nenhuma conexão Google encontrada.')
    );
    const app = buildApp();

    const res = await request(app)
      .get(`/api/google/profiles/${PROFILE_UUID}/quality`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(404);
  });
});