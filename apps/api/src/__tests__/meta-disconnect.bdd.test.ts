// =============================================================================
// BDD — DELETE /api/meta/connections/:id (router real + controller real)
/*
# Language: pt-BR

Funcionalidade: Desconectar a integração Meta e apagar seus dados sincronizados

  Cenário: desconectar uma conexão do próprio tenant
    Dado usuário autenticado e uma conexão Meta do seu tenant
    Quando DELETE /api/meta/connections/:id recebe um UUID válido
    Então responde 200 e delega a exclusão ao service com tenant e conexão

  Cenário: id de conexão inválido
    Dado usuário autenticado
    Quando DELETE recebe um id que não é UUID
    Então responde 400 VALIDATION_ERROR e não executa a exclusão

  Cenário: requisição sem autenticação
    Quando DELETE é chamado sem Authorization
    Então responde 401 e não executa a exclusão

  Cenário: token sem tenant
    Dado usuário autenticado sem tenantId no token
    Quando DELETE é chamado
    Então responde 403 FORBIDDEN e não executa a exclusão

  Cenário: conexão inexistente ou de outro tenant
    Dado usuário autenticado
    Quando o service não encontra a conexão dentro do tenant
    Então responde 404 META_CONNECTION_NOT_FOUND
*/
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const { mockMetaRepo, mockMetaSyncRepo, mockInvalidateCampaignsCache, mockInvalidateHttpCache } = vi.hoisted(() => ({
  mockMetaRepo: {
    findMetaConnectionById: vi.fn(),
    deleteMetaConnection: vi.fn(),
  },
  mockMetaSyncRepo: {
    deleteAllMetaSyncedData: vi.fn(),
  },
  mockInvalidateCampaignsCache: vi.fn().mockResolvedValue(undefined),
  mockInvalidateHttpCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../di.js', async () => {
  const { MetaController } = await import('../controllers/meta.controller.js');
  const { MetaService } = await import('../services/meta/meta.service.js');
  const service = new MetaService(
    () => mockMetaRepo as never,
    undefined,
    () => mockMetaSyncRepo as never,
  );
  return { controllers: { meta: new MetaController(service) } };
});

vi.mock('../lib/campaigns-cache.js', () => ({
  invalidateCampaignsCache: mockInvalidateCampaignsCache,
}));

vi.mock('../lib/http-cache.js', () => ({
  invalidateHttpCache: mockInvalidateHttpCache,
}));

vi.mock('../services/email/notify.js', () => ({ sendToTenant: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/email/email.service.js', () => ({
  emailService: { sendAccountDisconnected: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));

import metaRoutes from '../routes/meta.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

const TENANT_ID = 'd4e3f2c1-0000-4000-8000-00000000000d';
const CONNECTION_ID = '5ca0c5cb-609b-4215-a884-1a7edae648ee';

function authToken(withTenant = true): string {
  return jwt.sign(
    { userId: 'user-1', ...(withTenant ? { tenantId: TENANT_ID } : {}), email: 'owner@example.com', role: 'owner' },
    process.env.JWT_SECRET ?? 'test-jwt-secret',
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/meta', metaRoutes);
  app.use(errorHandler);
  return app;
}

describe('BDD: DELETE /api/meta/connections/:id', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mockMetaRepo.findMetaConnectionById.mockResolvedValue({ id: CONNECTION_ID, tenantId: TENANT_ID });
    mockMetaRepo.deleteMetaConnection.mockResolvedValue(undefined);
    mockMetaSyncRepo.deleteAllMetaSyncedData.mockResolvedValue(undefined);
  });

  it('Cenário: desconectar uma conexão do próprio tenant → 200', async () => {
    const response = await request(app)
      .delete(`/api/meta/connections/${CONNECTION_ID}`)
      .set('Authorization', `Bearer ${authToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: null });
    expect(mockMetaRepo.findMetaConnectionById).toHaveBeenCalledWith(CONNECTION_ID);
    expect(mockMetaSyncRepo.deleteAllMetaSyncedData).toHaveBeenCalledOnce();
    expect(mockMetaRepo.deleteMetaConnection).toHaveBeenCalledWith(CONNECTION_ID);
    expect(mockMetaSyncRepo.deleteAllMetaSyncedData.mock.invocationCallOrder[0])
      .toBeLessThan(mockMetaRepo.deleteMetaConnection.mock.invocationCallOrder[0]);
    expect(mockInvalidateCampaignsCache).toHaveBeenCalledWith(TENANT_ID);
    expect(mockInvalidateHttpCache).toHaveBeenCalledWith(TENANT_ID, ['/api/meta', '/api/metrics', '/api/goals']);
  });

  it('Cenário: id de conexão inválido → 400 VALIDATION_ERROR', async () => {
    const response = await request(app)
      .delete('/api/meta/connections/id-invalido')
      .set('Authorization', `Bearer ${authToken()}`);

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION_ERROR');
    expect(mockMetaRepo.findMetaConnectionById).not.toHaveBeenCalled();
    expect(mockMetaSyncRepo.deleteAllMetaSyncedData).not.toHaveBeenCalled();
  });

  it('Cenário: requisição sem autenticação → 401', async () => {
    const response = await request(app).delete(`/api/meta/connections/${CONNECTION_ID}`);

    expect(response.status).toBe(401);
    expect(response.body.error?.code).toBe('UNAUTHORIZED');
    expect(mockMetaRepo.findMetaConnectionById).not.toHaveBeenCalled();
    expect(mockMetaSyncRepo.deleteAllMetaSyncedData).not.toHaveBeenCalled();
  });

  it('Cenário: token sem tenant → 403 FORBIDDEN', async () => {
    const response = await request(app)
      .delete(`/api/meta/connections/${CONNECTION_ID}`)
      .set('Authorization', `Bearer ${authToken(false)}`);

    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe('FORBIDDEN');
    expect(mockMetaRepo.findMetaConnectionById).not.toHaveBeenCalled();
    expect(mockMetaSyncRepo.deleteAllMetaSyncedData).not.toHaveBeenCalled();
  });

  it('Cenário: conexão inexistente ou de outro tenant → 404 META_CONNECTION_NOT_FOUND', async () => {
    mockMetaRepo.findMetaConnectionById.mockResolvedValueOnce(null);

    const response = await request(app)
      .delete(`/api/meta/connections/${CONNECTION_ID}`)
      .set('Authorization', `Bearer ${authToken()}`);

    expect(response.status).toBe(404);
    expect(response.body.error?.code).toBe('META_CONNECTION_NOT_FOUND');
    expect(mockMetaRepo.findMetaConnectionById).toHaveBeenCalledWith(CONNECTION_ID);
    expect(mockMetaSyncRepo.deleteAllMetaSyncedData).not.toHaveBeenCalled();
    expect(mockMetaRepo.deleteMetaConnection).not.toHaveBeenCalled();
  });
});
