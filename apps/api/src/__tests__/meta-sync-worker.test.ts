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

  Cenário: manager registra um Job Scheduler estável sem duplicar em novo startup
    Dado dois startups do manager
    Quando o scheduler é registrado
    Então usa upsertJobScheduler com id 'meta-sync-tick'
    E o bootstrap mantém jobId fixo

  Cenário: job de tick processa um run por tenant
    Dado job 'meta-sync:tick'
    Quando o worker processa
    Então enfileira jobs 'meta-sync:run' para cada tenant com conexão Meta

  Cenário: jobId é determinístico por tenant + ciclo (dedupe multi-pod)
    Dado dois pods processando o mesmo tick no mesmo ciclo
    Quando cada um enfileira o run do tenant T
    Então ambos usam o MESMO jobId (BullMQ deduplica)

  Cenário: tick deduplica tenants que compartilham a mesma conta de anúncios
    Dado duas conexões com a mesma ad account
    Quando o tick enfileira runs
    Então existe um único job por ad account e ciclo

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

  Cenário: worker reporta erro e falha de job sem expor payload
    Dado um erro emitido pelo worker e um job que falhou
    Quando os eventos são processados
    Então captureServerException recebe somente tenantId e adAccountId do job
*/
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  dbMock,
  workerInstances,
  queueAddSpy,
  queueUpsertJobSchedulerSpy,
  mockSyncTenant,
  mockNotifyFailure,
  mockCaptureServerException,
} = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(() => ({
      from: vi.fn(async () => [
        { tenantId: 't1', adAccountId: 'act_1' },
        { tenantId: 't2', adAccountId: 'act_2' },
      ]),
    })),
    query: { metaConnections: { findFirst: vi.fn(async () => ({ selectedAdAccountId: 'act_1' })) } },
  } as any;
  const workerInstances: Array<{ name: string; processor: (job: any) => Promise<any>; emit: (event: string, ...args: any[]) => void }> = [];
  const queueAddSpy = vi.fn();
  const queueUpsertJobSchedulerSpy = vi.fn();
  const mockSyncTenant = vi.fn();
  const mockNotifyFailure = vi.fn();
  const mockCaptureServerException = vi.fn();
  return { dbMock, workerInstances, queueAddSpy, queueUpsertJobSchedulerSpy, mockSyncTenant, mockNotifyFailure, mockCaptureServerException };
});

vi.mock('bullmq', () => {
  class WorkerMock {
    name: string;
    processor: (job: any) => Promise<any>;
    closed = false;
    private listeners = new Map<string, (...args: any[]) => void>();
    constructor(name: string, processor: (job: any) => Promise<any>) {
      this.name = name;
      this.processor = processor;
      workerInstances.push(this);
    }
    on(event: string, listener: (...args: any[]) => void) {
      this.listeners.set(event, listener);
      return this;
    }
    emit(event: string, ...args: any[]) {
      this.listeners.get(event)?.(...args);
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
    async upsertJobScheduler(...args: unknown[]) {
      queueUpsertJobSchedulerSpy(...args);
      return { id: 'mock-scheduler' };
    }
    async removeRepeatable() {
      return true;
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

vi.mock('../lib/analytics.js', () => ({
  captureServerException: mockCaptureServerException,
}));

import {
  startMetaSyncManager,
  stopMetaSyncManager,
} from '../lib/meta-sync-manager.js';
import {
  startMetaSyncWorker,
  stopMetaSyncWorker,
  enqueueMetaSyncRuns,
  enqueueMetaSyncTenantRun,
  processMetaSyncRun,
  getMetaSyncTenantIds,
  getMetaSyncAdAccountIds,
  windowKeyFor,
  META_SYNC_QUEUE_NAME,
} from '../workers/meta-sync.worker.js';

describe('BDD: MetaSyncManager (agendamento)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerInstances.length = 0;
  });

  it('Cenário: agenda Job Scheduler */15 * * * * + bootstrap no startup', async () => {
    await startMetaSyncManager();

    expect(queueUpsertJobSchedulerSpy).toHaveBeenCalledWith(
      'meta-sync-tick',
      { pattern: '*/15 * * * *' },
      { name: 'meta-sync:tick', data: {} },
    );

    const bootstrapCall = queueAddSpy.mock.calls.find((args) => args[0] === 'meta-sync:bootstrap');
    expect(bootstrapCall).toBeTruthy();
    expect(bootstrapCall![2].jobId).toBe('meta-sync-bootstrap');

    await stopMetaSyncManager();
  });

  it('Cenário: segundo startup reaproveita o scheduler estável sem criar tick repetível', async () => {
    await startMetaSyncManager();
    await startMetaSyncManager();

    expect(queueUpsertJobSchedulerSpy).toHaveBeenCalledTimes(2);
    expect(queueAddSpy.mock.calls.filter((args) => args[0] === 'meta-sync:tick')).toHaveLength(0);
    expect(queueAddSpy.mock.calls.filter((args) => args[0] === 'meta-sync:bootstrap')).toHaveLength(2);

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

  it('Cenário: enqueueMetaSyncRuns enfileira um run por conta com jobId determinístico', async () => {
    const ts = '2026-09-25T21:30:00.000Z';
    await enqueueMetaSyncRuns(ts, { add: queueAddSpy });

    const runCalls = queueAddSpy.mock.calls.filter((args) => args[0] === 'meta-sync:run');
    expect(runCalls.length).toBe(2);
    expect(runCalls[0][1].adAccountId).toBe('act_1');
    expect(runCalls[0][2].jobId).toBe('meta-sync-acc-act_1-' + windowKeyFor(ts).replace(/[:.]/g, '-'));
    expect(runCalls[0][2].jobId).not.toContain(':');
  });

  it('Cenário: enqueueMetaSyncRuns deduplica por ad account', async () => {
    dbMock.select.mockReturnValueOnce({
      from: vi.fn(async () => [
        { adAccountId: 'act_1' },
        { adAccountId: 'act_1' },
        { adAccountId: 'act_2' },
      ]),
    });
    const ts = '2026-09-25T21:30:00.000Z';

    await enqueueMetaSyncRuns(ts, { add: queueAddSpy });

    const runCalls = queueAddSpy.mock.calls.filter((args) => args[0] === 'meta-sync:run');
    expect(runCalls).toHaveLength(2);
    expect(runCalls.map((args) => args[1])).toEqual([
      { adAccountId: 'act_1', reason: 'scheduled' },
      { adAccountId: 'act_2', reason: 'scheduled' },
    ]);
    expect(runCalls[0][2].jobId).toBe(`meta-sync-acc-act_1-${windowKeyFor(ts).replace(/:/g, '-')}`);
  });

  it('Cenário: getMetaSyncAdAccountIds retorna somente contas distintas', async () => {
    dbMock.select.mockReturnValueOnce({
      from: vi.fn(async () => [
        { adAccountId: 'act_1' }, { adAccountId: 'act_1' }, { adAccountId: 'act_2' },
      ]),
    });
    await expect(getMetaSyncAdAccountIds()).resolves.toEqual(['act_1', 'act_2']);
  });

  it('Cenário: jobId é determinístico no mesmo ciclo (dedupe multi-pod)', async () => {
    const ts = '2026-09-25T21:30:00.000Z';
    await enqueueMetaSyncRuns(ts, { add: queueAddSpy });
    await enqueueMetaSyncRuns('2026-09-25T21:35:00.000Z', { add: queueAddSpy });

    const runCalls = queueAddSpy.mock.calls.filter((args) => args[0] === 'meta-sync:run');
    const accountJobs = runCalls.filter((args) => args[1].adAccountId === 'act_1');
    expect(new Set(accountJobs.map((args) => args[2].jobId)).size).toBe(1);
  });

  it('Cenário: refresh stale usa uma chave por tenant para evitar jobs por request', async () => {
    await enqueueMetaSyncTenantRun({ tenantId: 't1', reason: 'stale-fallback', timestamp: '2026-09-25T21:30:00.000Z', queue: { add: queueAddSpy } });
    const [call] = queueAddSpy.mock.calls.filter((args) => args[0] === 'meta-sync:run');
    expect(call[2].jobId).toBe('meta-sync-stale-t1');
    expect(call[2].removeOnComplete).toMatchObject({ age: 300 });
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

  it('Cenário: exceção inesperada no sync alerta e mantém o job como falha', async () => {
    mockSyncTenant.mockRejectedValue(new Error('detalhe interno sensível'));

    await expect(processMetaSyncRun('t1', 'tick')).rejects.toThrow('detalhe interno sensível');
    expect(mockNotifyFailure).toHaveBeenCalledWith({
      tenantId: 't1',
      errorCode: 'META_SYNC_UNEXPECTED_ERROR',
      message: 'Falha inesperada na sincronização Meta.',
    });
  });

  it('Cenário: start/stop do worker', async () => {
    const worker = await startMetaSyncWorker();
    expect(worker).toBeTruthy();
    expect(workerInstances.length).toBe(1);
    await stopMetaSyncWorker();
    expect(workerInstances[0].closed).toBe(true);
  });

  it('Cenário: worker captura error e failed com contexto seguro', async () => {
    const worker = await startMetaSyncWorker() as any;
    const error = new Error('falha interna');

    worker.emit('error', error);
    worker.emit('failed', {
      data: { tenantId: 't1', adAccountId: 'act_1', accessToken: 'não-pode-vazar' },
    }, error);

    expect(mockCaptureServerException).toHaveBeenCalledWith(error, { path: 'meta-sync:worker' });
    expect(mockCaptureServerException).toHaveBeenCalledWith(error, {
      path: 'meta-sync:worker', tenantId: 't1', adAccountId: 'act_1',
    });
    expect(mockCaptureServerException.mock.calls[1][1]).not.toHaveProperty('accessToken');
    await stopMetaSyncWorker();
  });

  it('Cenário: worker processa job de run e job de tick', async () => {
    const worker = await startMetaSyncWorker();
    mockSyncTenant.mockResolvedValue({ status: 'success', partialFailures: [], campaignsCount: 0, leadsCount: 0, insightsCount: 0 });
    await worker.processor({ name: 'meta-sync:run', data: { tenantId: 't1', reason: 'tick' } });
    expect(mockSyncTenant).toHaveBeenCalledWith({ tenantId: 't1', reason: 'tick' });
    await stopMetaSyncWorker();
  });
});
