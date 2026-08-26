/**
 * Teste de INTEGRAÇÃO do fluxo completo de criação do Google Meu Negócio (US2).
 *
 * Usa o banco real (fury_test) + HTTP de ponta a ponta: o tenant conecta o Google
 * (google_connections), salva os dados do negócio (POST /settings) e cria o perfil
 * (POST /profiles). Ao final, valida que o perfil FOI criado de verdade no banco
 * (google_business_profiles + google_sync_logs) e que ficou gerencicável (GET /profiles/:id).
 * A API GBP é mockada (createGoogleApiClient); todo o resto é real.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const { mockCreateGoogleApiClient } = vi.hoisted(() => ({
  mockCreateGoogleApiClient: vi.fn(),
}));

// Mock só da API do Google — o banco (via googleRoutes/service) é REAL.
vi.mock('../lib/google-api.js', () => ({
  createGoogleApiClient: mockCreateGoogleApiClient,
}));

vi.mock('../lib/analytics.js', () => ({
  captureServerException: vi.fn(),
}));

import { db, googleConnections, googleBusinessProfiles, googleSyncLogs } from '@fury/db';
import { and, eq } from 'drizzle-orm';
import { encryptToken } from '../utils/crypto.js';
import { createTestTenant, createTestUser, cleanupDatabase, type TestUser } from './utils/test-helpers.js';
import googleRoutes from '../routes/google.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

const LOCATION = {
  name: 'accounts/123456/locations/789',
  title: 'Velora Studio',
  phoneNumbers: { primaryPhone: '+5511986344' },
  websiteUri: 'https://velorastudio.com.br',
  emailAddress: 'contato@velorastudio.com.br',
  categories: [{ categoryId: 'gcid:advertising_agency', displayName: 'Agência de publicidade' }],
  address: {
    addressLines: ['Av. Paulista, 1000'],
    locality: 'São Paulo',
    administrativeArea: 'SP',
    postalCode: '01310-100',
    regionCode: 'BR',
    languageCode: 'pt-BR',
  },
  metadata: { placeId: 'ChIJmockplaceid', canOperateGoogleMyBusiness: true },
  verification: { state: 'UNVERIFIED' },
};

function mockGbpClient() {
  mockCreateGoogleApiClient.mockReturnValue({
    listAccounts: vi.fn().mockResolvedValue([{ name: 'accounts/123456', accountName: 'Velora Studio' }]),
    listLocations: vi.fn().mockResolvedValue([LOCATION]),
    createLocation: vi.fn().mockResolvedValue(LOCATION),
    searchGoogleLocations: vi.fn().mockResolvedValue([]), // nenhum duplicado → cria
    getLocation: vi.fn().mockResolvedValue(LOCATION),
    patchLocation: vi.fn().mockResolvedValue(LOCATION),
    fetchVerificationOptions: vi.fn().mockResolvedValue([]),
    verifyLocation: vi.fn().mockResolvedValue({ status: 'PENDING' }),
    listVerifications: vi.fn().mockResolvedValue([]),
    listCategories: vi
      .fn()
      .mockResolvedValue([{ categoryId: 'gcid:advertising_agency', displayName: 'Agência de publicidade' }]),
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/google', googleRoutes);
  app.use(errorHandler);
  return app;
}

describe('Fluxo completo — criar perfil quando não existe (US2)', () => {
  let tenantId: string;
  let user: TestUser;

  beforeAll(async () => {
    mockGbpClient();
    const tenant = await createTestTenant('google-flow-tenant');
    tenantId = tenant.id;
    // Insere a conexão do Google conectada (sem accountId selecionado → o fluxo deve auto-selecionar)
    await db.insert(googleConnections).values({
      tenantId,
      googleUserId: 'google-user-123',
      accessToken: encryptToken('ya29.fake-access'),
      refreshToken: encryptToken('1//fake-refresh'),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });
    user = await createTestUser(tenantId, 'diogommtdes@gmail.com');
  });

  afterAll(cleanupDatabase);

  it('Given conectado + dados do negócio completos → When salva dados e cria perfil → Then o perfil É criado no Google e persiste no banco', async () => {
    const app = buildApp();
    const auth = { Authorization: `Bearer ${user.token}` };

    // 1) Salva os dados do negócio
    const settingsRes = await request(app)
      .put('/api/google/settings')
      .set(auth)
      .send({
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
      });
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.success).toBe(true);

    // 2) Cria o perfil (auto-seleciona a conta GBP)
    const createRes = await request(app).post('/api/google/profiles').set(auth);
    expect(createRes.status).toBe(201);
    expect(createRes.body.data).toMatchObject({
      gbpLocationId: 'accounts/123456/locations/789',
      name: 'Velora Studio',
      created: true,
      syncStatus: 'awaiting_verification',
      verificationState: 'UNVERIFIED',
    });
    const profileId = createRes.body.data.id;

    // 3) O perfil fica gerencicável (GET /profiles/:id retorna dados do GBP)
    const getRes = await request(app).get(`/api/google/profiles/${profileId}`).set(auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe('Velora Studio');
    expect(getRes.body.data.address).toMatchObject({ city: 'São Paulo', country: 'BR' });

    // 4) Validação real no banco: conexão ganhou a conta selecionada
    const [conn] = await db
      .select()
      .from(googleConnections)
      .where(eq(googleConnections.tenantId, tenantId));
    expect(conn.accountId).toBe('accounts/123456');
    expect(conn.accountName).toBe('Velora Studio');

    // 5) O perfil espelho + sync log foram persistidos de verdade
    const [profile] = await db
      .select()
      .from(googleBusinessProfiles)
      .where(and(eq(googleBusinessProfiles.tenantId, tenantId)));
    expect(profile).toBeDefined();
    expect(profile.gbpLocationId).toBe('accounts/123456/locations/789');
    expect(profile.syncStatus).toBe('awaiting_verification');
    expect(profile.verificationState).toBe('UNVERIFIED');

    const [log] = await db.select().from(googleSyncLogs).where(eq(googleSyncLogs.tenantId, tenantId));
    expect(log.operation).toBe('create');
    expect(log.status).toBe('success');
    expect(log.profileId).toBe(profile.id);
  });
});