/**
 * Testes unitários do sync worker do Google Meu Negócio (US5).
 *
 * Cobre o job BullMQ que sincroniza perfis com syncStatus
 * awaiting_verification/syncing, transicionando para verified,
 * escrevendo sync logs e enfileirando notificação por email.
 * Mocks no nível de lib/db, lib/google-api e bullmq — sem Redis real.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptToken } from '../utils/crypto.js';

const {
  dbMock,
  mockCreateGoogleApiClient,
  mockGetLocation,
  workerInstances,
  queueAddSpy,
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
  mockCreateGoogleApiClient: vi.fn(),
  mockGetLocation: vi.fn(),
  workerInstances: [] as Array<{
    name: string;
    processor: (job: { data: unknown }) => Promise<unknown>;
    handlers: Record<string, (...args: unknown[]) => unknown>;
  }>,
  queueAddSpy: vi.fn(),
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
      queueAddSpy(...args);
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

vi.mock('../lib/google-api.js', () => ({
  createGoogleApiClient: mockCreateGoogleApiClient,
}));

vi.mock('../services/email/email.service.js', () => ({
  emailService: {
    sendEmail: vi.fn().mockResolvedValue(undefined),
    sendGmbProfileVerified: vi.fn().mockResolvedValue(undefined),
    sendAccountConnected: vi.fn().mockResolvedValue(undefined),
    sendAccountDisconnected: vi.fn().mockResolvedValue(undefined),
    sendGmbLinked: vi.fn().mockResolvedValue(undefined),
    sendGmbUnlinked: vi.fn().mockResolvedValue(undefined),
    sendCampaignPublished: vi.fn().mockResolvedValue(undefined),
  },
}));

import { startGoogleSyncWorker, stopGoogleSyncWorker, processSyncJob } from '../workers/google-sync.worker.js';
import { emailService } from '../services/email/email.service.js';

function makeConnection(tenantId: string) {
  return {
    id: 'conn-1',
    tenantId,
    googleUserId: 'google-user-123',
    accessToken: encryptToken('ya29.fake-access'),
    refreshToken: encryptToken('1//fake-refresh'),
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    accountId: 'accounts/123456',
    accountName: 'Minha Empresa Ltda',
  };
}

function makeProfile(tenantId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    tenantId,
    connectionId: 'conn-1',
    gbpLocationId: 'accounts/123456/locations/789',
    name: 'Minha Empresa Ltda',
    email: 'contato@empresa.com.br',
    verificationState: 'UNVERIFIED',
    syncStatus: 'awaiting_verification',
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function resetMocks() {
  vi.clearAllMocks();
  workerInstances.length = 0;
  queueAddSpy.mockClear();
  mockCreateGoogleApiClient.mockReturnValue({
    getLocation: mockGetLocation,
    listAccounts: vi.fn(),
    listLocations: vi.fn(),
    createLocation: vi.fn(),
    searchGoogleLocations: vi.fn(),
    patchLocation: vi.fn(),
    fetchVerificationOptions: vi.fn(),
    verifyLocation: vi.fn(),
    listVerifications: vi.fn(),
    listCategories: vi.fn(),
  });
  dbMock.query.googleConnections.findFirst.mockResolvedValue(makeConnection('tenant-A'));
  dbMock.update.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  dbMock.insert.mockImplementation(() => {
    const valuesResult = Object.assign(Promise.resolve(undefined), {
      returning: vi.fn().mockResolvedValue([]),
    });
    return { values: vi.fn().mockReturnValue(valuesResult) };
  });
}

describe('google-sync.worker — startGoogleSyncWorker', () => {
  beforeEach(resetMocks);

  it('inicia o worker BullMQ com repeat pattern * * * * *', async () => {
    await startGoogleSyncWorker();

    expect(workerInstances).toHaveLength(1);
    expect(workerInstances[0].name).toBe('google-sync');
  });

  it('stopGoogleSyncWorker fecha o worker sem erros', async () => {
    await startGoogleSyncWorker();
    await expect(stopGoogleSyncWorker()).resolves.toBeUndefined();
  });
});

describe('processSyncJob — transição awaiting_verification → verified', () => {
  beforeEach(resetMocks);

  it('transiciona para verified quando o Google confirma a verificação', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([
      makeProfile('tenant-A', { syncStatus: 'awaiting_verification' }),
    ]);
    mockGetLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      verification: { state: 'VERIFIED' },
    });

    await processSyncJob();

    expect(mockGetLocation).toHaveBeenCalledWith('accounts/123456/locations/789');
    const setValues = dbMock.update.mock.results[0]?.value.set.mock.calls[0]?.[0] ?? {};
    expect(setValues.verificationState).toBe('VERIFIED');
    expect(setValues.syncStatus).toBe('verified');
    expect(dbMock.insert).toHaveBeenCalled();
  });

  it('mantém awaiting_verification quando o Google ainda não confirmou', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([
      makeProfile('tenant-A', { syncStatus: 'awaiting_verification' }),
    ]);
    mockGetLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      verification: { state: 'UNVERIFIED' },
    });

    await processSyncJob();

    const setValues = dbMock.update.mock.results[0]?.value.set.mock.calls[0]?.[0] ?? {};
    expect(setValues.verificationState).toBe('UNVERIFIED');
    expect(setValues.syncStatus).toBe('awaiting_verification');
  });

  it('envia email de notificação quando transiciona para verified', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([
      makeProfile('tenant-A', {
        syncStatus: 'awaiting_verification',
        email: 'contato@empresa.com.br',
      }),
    ]);
    mockGetLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      verification: { state: 'VERIFIED' },
    });

    await processSyncJob();

    expect(emailService.sendGmbProfileVerified).toHaveBeenCalledWith('contato@empresa.com.br', expect.any(String));
  });

  it('não envia email quando o perfil permanece não verificado', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([
      makeProfile('tenant-A', { syncStatus: 'awaiting_verification' }),
    ]);
    mockGetLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      verification: { state: 'UNVERIFIED' },
    });

    await processSyncJob();

    expect(emailService.sendGmbProfileVerified).not.toHaveBeenCalled();
  });

  it('escreve sync log com status success ao sincronizar', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([
      makeProfile('tenant-A', { syncStatus: 'awaiting_verification' }),
    ]);
    mockGetLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      verification: { state: 'VERIFIED' },
    });

    await processSyncJob();

    expect(dbMock.insert).toHaveBeenCalled();
  });
});

describe('processSyncJob — erro e isolamento', () => {
  beforeEach(resetMocks);

  it('registra erro no sync log quando o GBP falha', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([
      makeProfile('tenant-A', { syncStatus: 'awaiting_verification' }),
    ]);
    mockGetLocation.mockRejectedValue(new Error('GBP API offline'));

    await processSyncJob();

    expect(dbMock.insert).toHaveBeenCalled();
    const valuesCalls = dbMock.insert.mock.results.flatMap(
      (r: { value: { values: { mock: { calls: unknown[][] } } } }) => r.value.values.mock.calls
    );
    const errorLogValues = valuesCalls.find(
      (call: unknown[]) => (call[0] as Record<string, unknown>)?.status === 'failed'
    );
    expect(errorLogValues).toBeDefined();
    const logValues = errorLogValues[0] as Record<string, unknown>;
    expect(logValues.operation).toBe('sync');
    expect(logValues.status).toBe('failed');
    expect(logValues.message).toContain('GBP API offline');
  });

  it('processa perfis de múltiplos tenants sem vazar dados', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([
      makeProfile('tenant-A', { syncStatus: 'awaiting_verification' }),
      makeProfile('tenant-B', {
        id: 'profile-2',
        connectionId: 'conn-2',
        syncStatus: 'awaiting_verification',
      }),
    ]);
    mockGetLocation.mockResolvedValue({
      name: 'accounts/123456/locations/789',
      title: 'Minha Empresa Ltda',
      verification: { state: 'VERIFIED' },
    });

    await processSyncJob();

    expect(mockGetLocation).toHaveBeenCalledTimes(2);
    expect(dbMock.update).toHaveBeenCalledTimes(2);
  });

  it('ignora perfis já verificados', async () => {
    dbMock.query.googleBusinessProfiles.findMany.mockResolvedValue([
      makeProfile('tenant-A', { syncStatus: 'verified', verificationState: 'VERIFIED' }),
    ]);

    await processSyncJob();

    expect(mockGetLocation).not.toHaveBeenCalled();
  });
});
