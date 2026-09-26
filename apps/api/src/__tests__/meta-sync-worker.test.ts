// =============================================================================
// BDD — T004: MetaSyncManager + MetaSyncWorker (BullMQ cron, bootstrap, dedupe, email)
//
/*
# Language: pt-BR

Funcionalidade: Agendamento e processamento do sync assíncrono Meta

  Cenário: manager agenda o cron a cada 15min + bootstrap
    Dado startMetaSyncManager
    Quando registra o repeat job
    Então o padrão é 'a cada 15 minutos' (cron *&#47;15 * * * *)
    E enfileira um job 'meta-sync:bootstrap' no startup

  Cenário: job de tick processa um run por tenant
    Dado job 'meta-sync:tick'
    Quando o worker processa
    Então enfileira jobs 'meta-sync:run' para cada tenant com conexão Meta

  Cenário: jobId é determinístico por tenant + ciclo (dedupe multi-pod)
    Dado dois pods processando o mesmo tick no mesmo ciclo
    Quando cada um enfileira o run do tenant T
    Então ambos usam o MESMO jobId (BullMQ deduplica)

  Cenário: run de sucesso não dispara email
    Dado syncTenant retorna status 'success'
    Quando processMetaSyncRun
    Então notifyMetaSyncFailure NÃO é chamado

  Cenário: run failed dispara email de alerta
    Dado syncTenant retorna status 'failed' com errorCode
    Quando processMetaSyncRun
    Então notifyMetaSyncFailure é chamado com tenantId + errorCode

  Cenário: stop encerra o worker
    Dado worker iniciado
    Quando stopMetaSyncWorker
    Então o worker é fechado
*/
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  dbMock,
  workerInstances,
  queueAddSpy,
  mockSyncTenant,
  mockNotifyFailure,
} = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(() => ({
      from: vi.fn(async () => [
        { tenantId: 't1' },
        { tenantId: 't2' },
      ]),
    })),
    query: {},
  } as any;
  const workerInstances: Array<{ name: string; processor: (job: any) => Promise<any> }> = [];
  const queueAddSpy = vi.fn();
  const mockSyncTenant = vi.fn();
  const mockNotifyFailure = vi.fn();
  return { dbMock, workerInstances, queueAddSpy, mockSyncTenant, mockNotifyFailure };
});

vi.mock('bullmq', () => {
  class WorkerMock {
    name: string;
    processor: (job: any) => Promise<any>;
    closed = false;
    constructor(name: string, processor: (job: any) => Promise<any>) {
      this.name = name;
      this.processor = processor;
      workerInstances.push(this);
    }
    on() {
      return this;
    }
    async close() {
      this.closed = true;
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

vi.mock('../lib/queue.js', () => ({
  getRedisConnection: vi.fn(async () => ({})),
  getMetaSyncQueue: vi.fn(async () => ({ add: queueAddSpy })),
}));

vi.mock('../lib/db.js', () => ({
  db: dbMock,
  metaConnections: { tenantId: 'tenant_id' },
}));

vi.mock('../services/meta/meta-sync.service.js', () => ({
  metaSyncService: { syncTenant: mockSyncTenant },
}));

vi.mock('../lib/meta-sync-alerts.js', () => ({
  notifyMetaSyncFailure: mockNotifyFailure,
}));

import {
  startMetaSyncManager,
  stopMetaSyncManager,
} from '../lib/meta-sync-manager.js';
import {
  startMetaSyncWorker,
  stopMetaSyncWorker,
  enqueueMetaSyncRuns,
  processMetaSyncRun,
  getMetaSyncTenantIds,
  windowKeyFor,
  META_SYNC_QUEUE_NAME,
} from '../workers/meta-sync.worker.js';

describe('BDD: MetaSyncManager (agendamento)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerInstances.length = 0;
  });

  it('Cenário: agenda cron */15 * * * * + bootstrap no startup', async () => {
    await startMetaSyncManager();

    const repeatCall = queueAddSpy.mock.calls.find(
      (args) => args[2]?.repeat && args[2]?.repeat?.pattern
    );
    expect(repeatCall).toBeTruthy();
    expect(repeatCall![2].repeat.pattern).toBe('*/15 * * * *');
    expect(repeatCall![0]).toBe('meta-sync:tick');

    const bootstrapCall = queueAddSpy.mock.calls.find((args) => args[0] === 'meta-sync:bootstrap');
    expect(bootstrapCall).toBeTruthy();

    await stopMetaSyncManager();
  });
});

describe('BDD: MetaSyncWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerInstances.length = 0;
  });

  it('Cenário: getMetaSyncTenantIds lista tenants com conexão Meta', async () => {
    const ids = await getMetaSyncTenantIds();
    expect(ids).toEqual(['t1', 't2']);
  });

  it('Cenário: enqueueMetaSyncRuns enfileira um run por tenant com jobId determinístico', async () => {
    const ts = '2026-09-25T21:30:00.000Z';
    await enqueueMetaSyncRuns(ts, { add: queueAddSpy });

    const runCalls = queueAddSpy.mock.calls.filter((args) => args[0] === 'meta-sync:run');
    expect(runCalls.length).toBe(2);
    expect(runCalls[0][1].tenantId).toBe('t1');
    expect(runCalls[0][2].jobId).toBe('meta-sync:t1:' + windowKeyFor(ts));
  });

  it('Cenário: jobId é determinístico no mesmo ciclo (dedupe multi-pod)', async () => {
    const ts = '2026-09-25T21:30:00.000Z';
    await enqueueMetaSyncRuns(ts, { add: queueAddSpy });
    await enqueueMetaSyncRuns('2026-09-25T21:35:00.000Z', { add: queueAddSpy });

    const runCalls = queueAddSpy.mock.calls.filter((args) => args[0] === 'meta-sync:run');
    const t1Jobs = runCalls.filter((args) => args[1].tenantId === 't1');
    expect(new Set(t1Jobs.map((args) => args[2].jobId)).size).toBe(1);
  });

  it('Cenário: processMetaSyncRun chama syncTenant', async () => {
    mockSyncTenant.mockResolvedValue({
      status: 'success',
      partialFailures: [],
      campaignsCount: 1,
      leadsCount: 0,
      insightsCount: 0,
    });
    await processMetaSyncRun('t1', 'tick');
    expect(mockSyncTenant).toHaveBeenCalledWith({ tenantId: 't1', reason: 'tick' });
    expect(mockNotifyFailure).not.toHaveBeenCalled();
  });

  it('Cenário: run failed dispara email de alerta', async () => {
    mockSyncTenant.mockResolvedValue({
      status: 'failed',
      errorCode: 'META_TIMEOUT',
      errorMessage: 'timeout',
      partialFailures: [],
      campaignsCount: 0,
      leadsCount: 0,
      insightsCount: 0,
    });
    await processMetaSyncRun('t1', 'tick');
    expect(mockNotifyFailure).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', errorCode: 'META_TIMEOUT' })
    );
  });

  it('Cenário: start/stop do worker', async () => {
    const worker = await startMetaSyncWorker();
    expect(worker).toBeTruthy();
    expect(workerInstances.length).toBe(1);
    await stopMetaSyncWorker();
    expect(workerInstances[0].closed).toBe(true);
  });

  it('Cenário: worker processa job de run e job de tick', async () => {
    const worker = await startMetaSyncWorker();
    mockSyncTenant.mockResolvedValue({ status: 'success', partialFailures: [], campaignsCount: 0, leadsCount: 0, insightsCount: 0 });
    await worker.processor({ name: 'meta-sync:run', data: { tenantId: 't1', reason: 'tick' } });
    expect(mockSyncTenant).toHaveBeenCalledWith({ tenantId: 't1', reason: 'tick' });
    await stopMetaSyncWorker();
  });
});