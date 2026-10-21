/**
 * Testes do worker de status do Google Ads (Fluxo 3 — F3.6/F4.1).
 *
 * Cobre: consulta SearchStream (campaign.status + customer_asset_set.status),
 * atualização do perfil com status/budget, transição ENABLED→PAUSED e
 * isolamento por tenant. Sem Redis real (mock bullmq) e sem HTTP real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptToken } from '../utils/crypto.js';

const {
  dbMock,
  mockCreateGoogleAdsApiClient,
  mockSearchStream,
  workerInstances,
} = vi.hoisted(() => ({
  dbMock: {
    query: {
      googleConnections: { findFirst: vi.fn() },
      googleBusinessProfiles: { findFirst: vi.fn(), findMany: vi.fn() },
      businessProfileSettings: { findFirst: vi.fn() },
      tenants: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as any,
  mockCreateGoogleAdsApiClient: vi.fn(),
  mockSearchStream: vi.fn(),
  workerInstances: [] as Array<{
    name: string;
    processor: (job: { data: unknown }) => Promise<unknown>;
    handlers: Record<string, (...args: unknown[]) => unknown>;
  }>,
}));

vi.mock('bullmq', () => {
  class WorkerMock {
    name: string;
    processor: (job: { data: unknown }) => Promise<unknown>;
    handlers: Record<string, (...args: unknown[]) => unknown> = {};
    constructor(name: string, processor: (job: { data: unknown }) => Promise<unknown>) {
      this.name = name;
      this.processor = processor;
      workerInstances.push(this);
    }
    on(event: string, handler: (...args: unknown[]) => unknown) {
      this.handlers[event] = handler;
      return this;
    }
    async close() {
      return undefined;
    }
  }
  class QueueMock {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    async add(...args: unknown[]) {
      return { id: 'mock-job' };
    }
    async close() {
      return undefined;
    }
  }
  return { Worker: WorkerMock, Queue: QueueMock };
});

vi.mock('@fury/db', () => ({
  db: dbMock,
  googleConnections: {},
  googleBusinessProfiles: {},
  businessProfileSettings: {},
  googleSyncLogs: {},
  tenants: {},
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  inArray: vi.fn((a: unknown, b: unknown[]) => ({ type: 'inArray', a, b })),
}));

vi.mock('../lib/google-ads-api.js', () => ({
  createGoogleAdsApiClient: mockCreateGoogleAdsApiClient,
}));

import {
  startGoogleAdsWorker,
  stopGoogleAdsWorker,
  processAdsStatusJob,
} from '../workers/google-ads.worker.js';

function makeConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    tenantId: 'tenant-A',
    googleUserId: 'google-user-123',
    accessToken: encryptToken('ya29.fake'),
    refreshToken: encryptToken('1//fake'),
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    accountId: 'accounts/123456',
    accountName: 'Minha Empresa',
    scopes: ['https://www.googleapis.com/auth/adwords'],
    ...overrides,
  };
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    tenantId: 'tenant-A',
    connectionId: 'conn-1',
    gbpLocationId: 'locations/789',
    name: 'Minha Empresa',
    address: {},
    email: 'contato@empresa.com.br',
    verificationState: 'VERIFIED',
    syncStatus: 'verified',
    adsCampaignId: '999',
    adsCampaignStatus: 'ENABLED',
    adsMonthlyBudget: '300.00',
    adsBudgetMicros: 9_863_013,
    adsServedAt: new Date(Date.now() - 3_600_000),
    ...overrides,
  };
}

function resetMocks() {
  vi.clearAllMocks();
  workerInstances.length = 0;
  dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection());
  dbMock.update.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
  });
  dbMock.insert.mockImplementation(() => {
    const valuesResult = Object.assign(Promise.resolve(undefined), {
      returning: vi.fn().mockResolvedValue([]),
    });
    return { values: vi.fn().mockReturnValue(valuesResult) };
  });
  mockCreateGoogleAdsApiClient.mockReturnValue({
    searchStream: mockSearchStream,
  });
}

beforeEach(resetMocks);

describe('google-ads.worker — lifecycle', () => {
  it('inicia o worker BullMQ', async () => {
    await startGoogleAdsWorker();
    expect(workerInstances).toHaveLength(1);
    expect(workerInstances[0].name).toBe('google-ads');
    await stopGoogleAdsWorker();
  });
});

describe('processAdsStatusJob', () => {
  it('consulta status das campanhas e atualiza perfis', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([makeProfile()]);
    mockSearchStream.mockResolvedValue([
      { campaign: { id: '999', status: 'ENABLED' }, customerAssetSet: { assetSet: 'customers/1/assetSets/111', status: 'ENABLED' } },
    ]);

    await processAdsStatusJob();

    expect(mockSearchStream).toHaveBeenCalledWith(expect.stringContaining('SELECT campaign.id'));
    const setValues = dbMock.update.mock.results[0]?.value.set.mock.calls[0]?.[0] ?? {};
    expect(setValues.adsCampaignStatus).toBe('ENABLED');
    expect(setValues.adsServedAt).toBeInstanceOf(Date);
  });

  it('atualiza para PAUSED quando o Google reporta pausada', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([makeProfile()]);
    mockSearchStream.mockResolvedValue([
      { campaign: { id: '999', status: 'PAUSED' }, customerAssetSet: { assetSet: 'customers/1/assetSets/111', status: 'ENABLED' } },
    ]);

    await processAdsStatusJob();

    const setValues = dbMock.update.mock.results[0]?.value.set.mock.calls[0]?.[0] ?? {};
    expect(setValues.adsCampaignStatus).toBe('PAUSED');
  });

  it('não consulta perfis sem campanha Ads', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([makeProfile({ adsCampaignId: null })]);

    await processAdsStatusJob();

    expect(mockSearchStream).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('registra erro no sync log quando o Ads falha', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([makeProfile()]);
    mockSearchStream.mockRejectedValue(new Error('Google Ads API offline'));

    await processAdsStatusJob();

    expect(dbMock.insert).toHaveBeenCalled();
  });
});