/**
 * Testes BDD (Given/When/Then) do fluxo de CRIAÇÃO de perfil no Google Meu Negócio
 * via rota HTTP `POST /api/google/profiles` (US2 — cenário 1 do spec 011).
 *
 * Mapeia o cenário de aceite: "Dado o cliente conectado com dados completos,
 * Quando ele cria o perfil, Então o Ady chama a GBP API, persiste o perfil
 * (google_business_profiles) e registra o sync log".
 *
 * Valida também os ramos de exceção previstos no spec: sem conexão (404),
 * dados do negócio incompletos (400), duplicado com confiança alta (409) e
 * isolamento por tenant (401/403). Mocks em lib/db e lib/google-api — sem HTTP real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import express from 'express';

const {
  dbMock,
  mockCreateGoogleApiClient,
  mockSearchGoogleLocations,
  mockCreateLocation,
  mockListAccounts,
} = vi.hoisted(() => ({
  dbMock: {
    query: {
      googleConnections: { findFirst: vi.fn() },
      googleBusinessProfiles: { findFirst: vi.fn() },
      businessProfileSettings: { findFirst: vi.fn() },
      googleSyncLogs: { findFirst: vi.fn(), findMany: vi.fn() },
      users: { findMany: vi.fn().mockResolvedValue([]) },
      tenants: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as any,
  mockCreateGoogleApiClient: vi.fn(),
  mockSearchGoogleLocations: vi.fn(),
  mockCreateLocation: vi.fn(),
  mockListAccounts: vi.fn(),
}));

vi.mock('@fury/db', () => ({
  db: dbMock,
  googleConnections: {},
  googleBusinessProfiles: {},
  businessProfileSettings: {},
  googleSyncLogs: {},
  users: {},
  tenants: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('../lib/google-api.js', () => ({
  createGoogleApiClient: mockCreateGoogleApiClient,
}));

vi.mock('../lib/analytics.js', () => ({
  captureServerException: vi.fn(),
}));

import { encryptToken } from '../utils/crypto.js';
import { AppError } from '../middleware/errorHandler.js';
import googleRoutes from '../routes/google.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

function makeConnection(tenantId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    tenantId,
    googleUserId: 'google-user-123',
    accessToken: encryptToken('ya29.fake-access'),
    refreshToken: encryptToken('1//fake-refresh'),
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    accountId: 'accounts/123456',
    accountName: 'Velora Studio',
    ...overrides,
  };
}

function makeSettings(tenantId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'settings-1',
    tenantId,
    name: 'Velora Studio',
    address: {
      street: 'Av. Paulista, 1000',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01310-100',
      country: 'BR',
    },
    phone: '+5511986344',
    email: 'contato@velorastudio.com.br',
    website: 'https://velorastudio.com.br',
    categoryId: 'gcid:advertising_agency',
    hours: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTenant(tenantId: string) {
  return {
    id: tenantId,
    name: 'Velora Studio',
    slug: 'diogodev',
    codigo: null,
    businessContext: 'Agência de publicidade',
    createdAt: new Date(),
  };
}

function resetMocks() {
  vi.clearAllMocks();
  mockCreateGoogleApiClient.mockReturnValue({
    searchGoogleLocations: mockSearchGoogleLocations,
    createLocation: mockCreateLocation,
    listCategories: vi.fn().mockResolvedValue([]),
    listAccounts: mockListAccounts,
  });
  mockSearchGoogleLocations.mockResolvedValue([]);
  mockCreateLocation.mockResolvedValue({
    name: 'accounts/123456/locations/789',
    title: 'Velora Studio',
  });
  mockListAccounts.mockResolvedValue([]);
  dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection('tenant-A'));
  dbMock.query.businessProfileSettings.findFirst.mockResolvedValue(makeSettings('tenant-A'));
  dbMock.query.tenants.findFirst.mockResolvedValue(makeTenant('tenant-A'));
  dbMock.insert.mockImplementation(() => {
    const valuesResult = Object.assign(Promise.resolve(undefined), {
      returning: vi.fn().mockResolvedValue([{ id: 'profile-1', name: 'Velora Studio' }]),
    });
    return { values: vi.fn().mockReturnValue(valuesResult) };
  });
  dbMock.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
  dbMock.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
}

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/google', googleRoutes);
  app.use(errorHandler);
  return app;
}

function authToken(tenantId: string): string {
  // Assina com o JWT_SECRET do ambiente de teste (setup.env / vitest config).
  return jwt.sign(
    { userId: 'user-1', tenantId, email: 'diogommtdes@gmail.com', role: 'owner' },
    process.env.JWT_SECRET ?? 'test-jwt-secret-not-for-production'
  );
}

describe('GBP — criação de perfil (POST /api/google/profiles)', () => {
  beforeEach(resetMocks);

  describe('Cenário 1 — perfil criado com sucesso (US2 · Given cliente conectado com dados completos → When cria → Then persiste)', () => {
    it('retorna 201 e persiste google_business_profiles + google_sync_logs quando a criação no Google é aceita', async () => {
      const app = buildTestApp();

      const res = await request(app)
        .post('/api/google/profiles')
        .set('Authorization', `Bearer ${authToken('tenant-A')}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        gbpLocationId: 'accounts/123456/locations/789',
        name: 'Velora Studio',
        syncStatus: 'awaiting_verification',
        verificationState: 'UNVERIFIED',
        created: true,
      });

      // Persistiu o perfil espelho + o sync log (2 inserts).
      expect(dbMock.insert).toHaveBeenCalledTimes(2);
      const insertedProfile = dbMock.insert.mock.results[0].value.values.mock.calls[0][0] as Record<string, unknown>;
      expect(insertedProfile.tenantId).toBe('tenant-A');
      expect(insertedProfile.gbpLocationId).toBe('accounts/123456/locations/789');
      expect(insertedProfile.syncStatus).toBe('awaiting_verification');
      expect(insertedProfile.verificationState).toBe('UNVERIFIED');

      const insertedLog = dbMock.insert.mock.results[1].value.values.mock.calls[0][0] as Record<string, unknown>;
      expect(insertedLog.operation).toBe('create');
      expect(insertedLog.status).toBe('success');
    });

    it('envia à GBP API o payload completo do negócio (título, telefone, endereço, categoria, website, email)', async () => {
      await request(buildTestApp())
        .post('/api/google/profiles')
        .set('Authorization', `Bearer ${authToken('tenant-A')}`);

      expect(mockCreateLocation).toHaveBeenCalledTimes(1);
      const [accountName, payload] = mockCreateLocation.mock.calls[0] as [string, Record<string, unknown>];
      expect(accountName).toBe('accounts/123456');
      expect(payload.title).toBe('Velora Studio');
      expect(payload.phoneNumbers).toEqual({ primaryPhone: '+5511986344' });
      expect(payload.categories).toEqual([{ categoryId: 'gcid:advertising_agency' }]);
      expect(payload.websiteUri).toBe('https://velorastudio.com.br');
      expect(payload.emailAddress).toBe('contato@velorastudio.com.br');
      expect(payload.address).toMatchObject({ locality: 'São Paulo', regionCode: 'BR' });
    });

    it('Given conectado sem conta selecionada → Then orienta a criação manual (422 GBP_CREATION_NOT_SUPPORTED)', async () => {
      dbMock.query.googleConnections.findFirst.mockResolvedValue(
        makeConnection('tenant-A', { accountId: null, accountName: null })
      );
      mockListAccounts.mockResolvedValue([{ name: 'accounts/999', accountName: 'Empresa X Ltda' }]);

      const res = await request(buildTestApp())
        .post('/api/google/profiles')
        .set('Authorization', `Bearer ${authToken('tenant-A')}`);

      // Comportamento atual (decisão de produto): sem conta selecionada, o Google
      // não permite criação automática — orienta o fluxo manual.
      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe('GBP_CREATION_NOT_SUPPORTED');
      expect(mockCreateLocation).not.toHaveBeenCalled();
      expect(dbMock.update).not.toHaveBeenCalled();
    });
  });

  describe('Cenário 2 — exceções e isolamento', () => {
    it('Given rejeitado pela API do Google (perfil duplicado com confiança alta) → Then 409 DUPLICATE_LOCATION e NADA é criado', async () => {
      mockSearchGoogleLocations.mockResolvedValue([
        {
          locationName: 'accounts/999999/locations/123',
          location: { title: 'Velora Studio', metadata: { canOperateGoogleMyBusiness: false } },
        },
      ]);

      const res = await request(buildTestApp())
        .post('/api/google/profiles')
        .set('Authorization', `Bearer ${authToken('tenant-A')}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_LOCATION');
      expect(mockCreateLocation).not.toHaveBeenCalled();
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it('Given sem dados completos do negócio → Then 400 BUSINESS_SETTINGS_INCOMPLETE e NADA é criado', async () => {
      dbMock.query.businessProfileSettings.findFirst.mockResolvedValue(
        makeSettings('tenant-A', { phone: '', categoryId: '' })
      );

      const res = await request(buildTestApp())
        .post('/api/google/profiles')
        .set('Authorization', `Bearer ${authToken('tenant-A')}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BUSINESS_SETTINGS_INCOMPLETE');
      expect(mockCreateLocation).not.toHaveBeenCalled();
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it('Given tenant sem conexão Google → Then 404 NOT_FOUND e NADA é criado', async () => {
      dbMock.query.googleConnections.findFirst.mockResolvedValue(null);

      const res = await request(buildTestApp())
        .post('/api/google/profiles')
        .set('Authorization', `Bearer ${authToken('tenant-B')}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(mockCreateLocation).not.toHaveBeenCalled();
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it('Given conectado sem conta selecionada e sem conta disponível → Then 422 GBP_CREATION_NOT_SUPPORTED e NADA é criado', async () => {
      dbMock.query.googleConnections.findFirst.mockResolvedValue(
        makeConnection('tenant-A', { accountId: null, accountName: null })
      );
      mockListAccounts.mockResolvedValue([]);
      mockSearchGoogleLocations.mockResolvedValue([]);

      const res = await request(buildTestApp())
        .post('/api/google/profiles')
        .set('Authorization', `Bearer ${authToken('tenant-A')}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('GBP_CREATION_NOT_SUPPORTED');
      expect(mockCreateLocation).not.toHaveBeenCalled();
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it('Given o Google recusa criação automática → Then 422 GBP_CREATION_NOT_SUPPORTED com orientação manual', async () => {
      mockCreateLocation.mockRejectedValue(
        new AppError(422, 'GOOGLE_API_ERROR', 'Google não suporta criação automática neste país.')
      );

      const res = await request(buildTestApp())
        .post('/api/google/profiles')
        .set('Authorization', `Bearer ${authToken('tenant-A')}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('GBP_CREATION_NOT_SUPPORTED');
      expect(dbMock.insert).not.toHaveBeenCalled();
    });

    it('Given token de acesso expirado → Then propaga 401 GOOGLE_TOKEN_EXPIRED (não vira 422)', async () => {
      mockCreateLocation.mockRejectedValue(
        new AppError(401, 'GOOGLE_TOKEN_EXPIRED', 'Sua conexão com o Google expirou. Reconecte para continuar.')
      );

      const res = await request(buildTestApp())
        .post('/api/google/profiles')
        .set('Authorization', `Bearer ${authToken('tenant-A')}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('GOOGLE_TOKEN_EXPIRED');
    });

    it('Given requisição sem autenticação → Then 401 UNAUTHORIZED', async () => {
      const res = await request(buildTestApp()).post('/api/google/profiles');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});