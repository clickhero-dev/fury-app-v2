// =============================================================================
// BDD — T004: LeadStatus Worker (cron diário de envelhecimento de status)
//
/*
# Language: pt-BR

Funcionalidade: Regra automática de status de clientes (1º dia novo, 2º dia não contatado)

  Cenário: manager agenda o cron diário às 03:00
    Dado startLeadStatusManager
    Quando registra o repeat job
    Então o padrão é '0 3 * * *' (diário 03:00)
    E enfileira um job 'lead-status:cron' com jobId determinístico
    E inicia o consumidor da fila para que o cron seja processado
    E fixa o fuso UTC e retenta falhas transitórias

  Cenário: processamento atualiza leads novos vencidos de todos os tenants
    Dado tenants com leads
    Quando processLeadStatusRun(cutoff) é chamado
    Então markStaleNewLeadsAsNotContacted é chamado por tenant com o cutoff
    E captura evento de telemetria com o total de leads atualizados

  Cenário: cutoff é agora - 2 dias (regra do 2º dia)
    Dado processLeadStatusRun sem cutoff explícito
    Então o cutoff usado é created_time <= agora - 48h

  Cenário: sem leads nenhum não quebra
    Dado nenhum tenant com leads
    Quando processLeadStatusRun
    Então retorna sem erro e telemetria registra 0

  Cenário: stop encerra o worker
    Dado worker iniciado
    Quando stopLeadStatusWorker
    Então o worker é fechado
*/
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  dbMock,
  workerInstances,
  queueAddSpy,
  mockRepoUpdate,
  mockCaptureEvent,
} = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(() => ({ from: vi.fn() })) as any,
    query: {},
  } as any;
  const workerInstances: Array<{ name: string; processor: (job: any) => Promise<any> }> = [];
  const queueAddSpy = vi.fn();
  const mockRepoUpdate = vi.fn();
  const mockCaptureEvent = vi.fn();
  return { dbMock, workerInstances, queueAddSpy, mockRepoUpdate, mockCaptureEvent };
});

vi.mock('bullmq', () => {
  class QueueMock {
    name: string;
    add: typeof queueAddSpy;
    constructor(name: string) {
      this.name = name;
      this.add = queueAddSpy;
    }
    async close() {}
  }
  class WorkerMock {
    name: string;
    processor: (job: any) => Promise<any>;
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    constructor(name: string, processor: (job: any) => Promise<any>) {
      this.name = name;
      this.processor = processor;
      workerInstances.push({ name, processor });
      this.on = vi.fn();
      this.close = vi.fn(async () => {});
    }
  }
  return { Queue: QueueMock, Worker: WorkerMock };
});

vi.mock('../lib/queue.js', () => ({
  getRedisConnection: vi.fn(async () => ({ duplicate: () => ({}) })),
}));

vi.mock('../lib/db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db.js')>();
  return { ...actual, db: dbMock };
});

vi.mock('../repository/meta-sync.repository.js', () => {
  class MetaSyncRepositoryMock {
    constructor(public tenantId: string) {}
    markStaleNewLeadsAsNotContacted = mockRepoUpdate;
  }
  return { MetaSyncRepository: MetaSyncRepositoryMock };
});

vi.mock('../lib/analytics.js', () => ({
  captureServerEvent: mockCaptureEvent,
}));

import { Queue } from 'bullmq';
import {
  getTenantIdsWithLeads,
  processLeadStatusRun,
  startLeadStatusWorker,
  stopLeadStatusWorker,
  startLeadStatusManager,
} from '../workers/lead-status.worker.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BDD: LeadStatusWorker', () => {
  it('Cenário: manager agenda o cron diário às 03:00', async () => {
    await startLeadStatusManager();
    const addCalls = queueAddSpy.mock.calls;
    const cronCall = addCalls.find((c) => c[0] === 'lead-status:cron');
    expect(cronCall).toBeTruthy();
    expect(cronCall![2].repeat.pattern).toBe('0 3 * * *');
    expect(cronCall![2].repeat.tz).toBe('UTC');
    expect(cronCall![2].jobId).toBe('lead-status-cron');
    expect(cronCall![2].attempts).toBe(3);
    expect(cronCall![2].backoff).toEqual({ type: 'exponential', delay: 5_000 });
    expect(workerInstances.some((worker) => worker.name === 'lead-status')).toBe(true);
  });

  it('Cenário: processamento atualiza leads vencidos de todos os tenants e captura telemetria', async () => {
    dbMock.select.mockImplementation(() => ({
      from: vi.fn(() => ({ groupBy: vi.fn(async () => [{ tenantId: 't1' }, { tenantId: 't2' }]) })),
    }));
    mockRepoUpdate.mockResolvedValue(3);

    const cutoff = new Date('2026-09-26T00:00:00Z');
    await processLeadStatusRun(cutoff);

    expect(mockRepoUpdate).toHaveBeenCalledTimes(2);
    expect(mockRepoUpdate).toHaveBeenCalledWith(cutoff);
    expect(mockCaptureEvent).toHaveBeenCalledWith('lead_status_stale_marked', expect.objectContaining({
      updated: 6,
      tenants: 2,
    }));
  });

  it('Cenário: cutoff padrão é agora - 2 dias', async () => {
    dbMock.select.mockImplementation(() => ({
      from: vi.fn(() => ({ groupBy: vi.fn(async () => [{ tenantId: 't1' }]) })),
    }));
    mockRepoUpdate.mockResolvedValue(1);

    await processLeadStatusRun();

    const cutoffArg = mockRepoUpdate.mock.calls[0][0] as Date;
    const expectedMin = Date.now() - 2 * 24 * 60 * 60 * 1000 - 5_000;
    expect(cutoffArg.getTime()).toBeLessThan(Date.now() - (2 - 1) * 24 * 60 * 60 * 1000);
    expect(cutoffArg.getTime()).toBeGreaterThan(expectedMin);
  });

  it('Cenário: sem tenants com leads não quebra e registra 0', async () => {
    dbMock.select.mockImplementation(() => ({
      from: vi.fn(() => ({ groupBy: vi.fn(async () => []) })),
    }));

    await expect(processLeadStatusRun(new Date())).resolves.toBeUndefined();
    expect(mockCaptureEvent).toHaveBeenCalledWith('lead_status_stale_marked', expect.objectContaining({ updated: 0, tenants: 0 }));
  });

  it('Cenário: worker processa o job lead-status:run', async () => {
    dbMock.select.mockImplementation(() => ({
      from: vi.fn(() => ({ groupBy: vi.fn(async () => [{ tenantId: 't1' }]) })),
    }));
    mockRepoUpdate.mockResolvedValue(2);

    const worker = await startLeadStatusWorker();
    const instance = workerInstances.find((w) => w.name === 'lead-status');
    expect(instance).toBeTruthy();
    await instance!.processor({ name: 'lead-status:run', data: { cutoff: '2026-09-26T00:00:00Z' } });
    expect(mockRepoUpdate).toHaveBeenCalledTimes(1);

    await stopLeadStatusWorker();
    expect(worker.close).toHaveBeenCalled();
  });

  it('Cenário: getTenantIdsWithLeads busca tenants distintos de meta_leads', async () => {
    dbMock.select.mockImplementation(() => ({
      from: vi.fn(() => ({ groupBy: vi.fn(async () => [{ tenantId: 't1' }, { tenantId: 't2' }]) })),
    }));
    const ids = await getTenantIdsWithLeads();
    expect(ids).toEqual(['t1', 't2']);
  });
});
