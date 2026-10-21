/**
 * Painel do dono / cartão público / perfis (spec 015, Fase 1).
 * Rotas: router real + controller real com service mockado.
 * Service: googleService real com lib/db e lib/google-api mockados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { encryptToken } from '../utils/crypto.js';

const { mockGoogleService, dbMock, mockCreateGoogleApiClient, mockGetLocation, mockListLocations } = vi.hoisted(
  () => ({
    mockGoogleService: {
      getOwnerOverview: vi.fn(),
      getPublicCard: vi.fn(),
      listAccountLocations: vi.fn(),
    },
    dbMock: {
      query: {
        googleConnections: { findFirst: vi.fn() },
        googleBusinessProfiles: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as any,
    mockCreateGoogleApiClient: vi.fn(),
    mockGetLocation: vi.fn(),
    mockListLocations: vi.fn(),
  }),
);

vi.mock('../di.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../di.js')>();
  const { GoogleController } = await import('../controllers/google.controller.js');
  return {
    ...actual,
    controllers: { ...actual.controllers, google: new GoogleController(mockGoogleService as never) },
  };
});

vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));

vi.mock('@fury/db', () => ({
  db: dbMock,
  googleConnections: {},
  googleBusinessProfiles: {},
  businessProfileSettings: {},
  googleSyncLogs: {},
  tenants: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('../lib/google-api.js', () => ({ createGoogleApiClient: mockCreateGoogleApiClient }));

import { errorHandler, AppError } from '../middleware/errorHandler.js';
import googleRoutes from '../routes/google.routes.js';
import { googleService } from '../services/google/google.service.js';

const VALID_TOKEN = jwt.sign(
  { userId: 'u-1', tenantId: 't-1', email: 'teste@ady.com.br', role: 'admin' },
  process.env.JWT_SECRET ?? 'test-jwt-secret-min-32-characters-long-aaaa',
);
const PROFILE_UUID = '123e4567-e89b-12d3-a456-426614174000';
const ENDPOINTS = [
  { path: 'overview', method: 'getOwnerOverview' },
  { path: 'public-card', method: 'getPublicCard' },
  { path: 'locations', method: 'listAccountLocations' },
] as const;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/google', googleRoutes);
  app.use(errorHandler);
  return app;
}

describe.each(ENDPOINTS)('GET /api/google/profiles/:id/$path', ({ path, method }) => {
  beforeEach(() => vi.clearAllMocks());

  it('200 com envelope e tenant da requisição', async () => {
    mockGoogleService[method].mockResolvedValue({ ok: true });

    const res = await request(buildApp())
      .get(`/api/google/profiles/${PROFILE_UUID}/${path}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { ok: true } });
    expect(mockGoogleService[method]).toHaveBeenCalledWith(PROFILE_UUID, 't-1');
  });

  it('401 sem token', async () => {
    const res = await request(buildApp()).get(`/api/google/profiles/${PROFILE_UUID}/${path}`);
    expect(res.status).toBe(401);
    expect(mockGoogleService[method]).not.toHaveBeenCalled();
  });

  it('400 com id não-uuid', async () => {
    const res = await request(buildApp())
      .get(`/api/google/profiles/nao-uuid/${path}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(400);
  });

  it('404 propagado do service (perfil de outro tenant)', async () => {
    mockGoogleService[method].mockRejectedValue(new AppError(404, 'NOT_FOUND', 'Perfil não encontrado.'));
    const res = await request(buildApp())
      .get(`/api/google/profiles/${PROFILE_UUID}/${path}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});

// ---------- Service ----------

function makeConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    tenantId: 'tenant-A',
    googleUserId: 'google-user-123',
    accessToken: encryptToken('ya29.fake-access'),
    refreshToken: encryptToken('1//fake-refresh'),
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    accountId: 'accounts/123456',
    accountName: 'Minha Empresa Ltda',
    ...overrides,
  };
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    tenantId: 'tenant-A',
    connectionId: 'conn-1',
    gbpLocationId: 'accounts/123456/locations/789',
    name: 'Minha Empresa Ltda',
    categoryDisplayName: 'Padaria',
    photos: ['https://cdn.ady.com.br/a.jpg', 'javascript:alert(1)'],
    verificationState: 'VERIFIED',
    syncStatus: 'verified',
    adsCampaignId: null,
    ...overrides,
  };
}

const location = {
  name: 'locations/789',
  title: 'Padaria Estrela',
  categories: [
    { categoryId: 'gcid:bakery', displayName: 'Padaria' },
    { categoryId: 'gcid:coffee_shop', displayName: 'Cafeteria' },
  ],
  address: { addressLines: ['Av. Paulista, 1000'], locality: 'São Paulo', administrativeArea: 'SP', postalCode: '01310-100' },
  phoneNumbers: { primaryPhone: '+5511999999999' },
  websiteUri: 'javascript:alert(1)',
  openInfo: {
    periods: [{ openDay: 'WEDNESDAY', openTime: { hours: 8 }, closeDay: 'WEDNESDAY', closeTime: { hours: 18 } }],
  },
  description: 'Padaria artesanal',
  metadata: { placeId: 'ChIJx', mapsUri: 'https://evil.io/maps', newReviewUri: 'https://search.google.com/local/writereview?placeid=ChIJx' },
};

describe('googleService — painel, cartão e perfis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateGoogleApiClient.mockReturnValue({ getLocation: mockGetLocation, listLocations: mockListLocations });
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(makeProfile());
    dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection());
    mockGetLocation.mockResolvedValue(location);
  });

  it('404 nos 3 métodos quando o perfil não é do tenant', async () => {
    dbMock.query.googleBusinessProfiles.findFirst.mockResolvedValue(null);
    for (const call of [
      () => googleService.getOwnerOverview('profile-1', 'tenant-B'),
      () => googleService.getPublicCard('profile-1', 'tenant-B'),
      () => googleService.listAccountLocations('profile-1', 'tenant-B'),
    ]) {
      await expect(call()).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    }
    expect(mockGetLocation).not.toHaveBeenCalled();
  });

  it('overview: verificado, grade, força, sugestão de anúncio e link de avaliação', async () => {
    const overview = await googleService.getOwnerOverview('profile-1', 'tenant-A');

    expect(mockGetLocation).toHaveBeenCalledWith('accounts/123456/locations/789');
    expect(overview.profile).toMatchObject({ id: 'profile-1', name: 'Padaria Estrela', verified: true, categoryName: 'Padaria' });
    expect(overview.interactions).toBeNull();
    expect(overview.actions.map((a) => a.key)).toContain('menu');
    expect(overview.strength.items.find((i) => i.key === 'photos')?.done).toBe(false);
    expect(overview.suggestions.map((s) => s.id)).toEqual(['complete_profile', 'create_ad']);
    expect(overview.reviewLink).toBe('https://search.google.com/local/writereview?placeid=ChIJx');
  });

  it('overview: não expõe tokens da conexão', async () => {
    const overview = await googleService.getOwnerOverview('profile-1', 'tenant-A');
    expect(JSON.stringify(overview)).not.toMatch(/accessToken|refreshToken|ya29|1\/\//);
  });

  it('public-card: descarta links inseguros e monta abas e horário', async () => {
    const card = await googleService.getPublicCard('profile-1', 'tenant-A', new Date('2026-10-21T13:00:00Z'));

    expect(card.website).toBeNull();
    expect(card.mapsUri).toBeNull();
    expect(card.photos).toEqual([{ url: 'https://cdn.ady.com.br/a.jpg', source: 'ady_local', category: null }]);
    expect(card.photosNotice).toBe('ady_local');
    expect(card.additionalCategories).toEqual(['Cafeteria']);
    expect(card.addressLine).toBe('Av. Paulista, 1000, São Paulo - SP, 01310-100');
    expect(card.openStatus).toEqual({ state: 'open', label: 'Aberto · Fecha 18:00' });
    expect(card.tabs).toEqual(['overview', 'menu', 'reviews', 'photos', 'about', 'updates']);
    expect(card.rating).toBeNull();
    expect(JSON.stringify(card)).not.toMatch(/accessToken|refreshToken/);
  });

  it('locations: marca o perfil ativo mesmo com nome legado v4', async () => {
    mockListLocations.mockResolvedValue([
      { name: 'locations/789', title: 'Padaria Estrela', address: { locality: 'São Paulo' } },
      { name: 'locations/555', title: 'Filial' },
    ]);

    const result = await googleService.listAccountLocations('profile-1', 'tenant-A');

    expect(mockListLocations).toHaveBeenCalledWith('accounts/123456');
    expect(result.accountName).toBe('Minha Empresa Ltda');
    expect(result.locations).toEqual([
      { gbpLocationId: 'locations/789', name: 'Padaria Estrela', addressLine: 'São Paulo', active: true },
      { gbpLocationId: 'locations/555', name: 'Filial', addressLine: '', active: false },
    ]);
  });

  it('locations: 404 sem conta selecionada, sem chamar o Google', async () => {
    dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection({ accountId: null }));

    await expect(googleService.listAccountLocations('profile-1', 'tenant-A')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(mockListLocations).not.toHaveBeenCalled();
  });
});
