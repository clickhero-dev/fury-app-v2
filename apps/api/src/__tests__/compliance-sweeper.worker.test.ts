// Funcionalidade: executar a varredura de compliance como job BullMQ
/*
  Funcionalidade: enfileirar a recuperação de análises órfãs

  Cenário: scheduler BullMQ repete a varredura a cada cinco minutos
    Dado que o sweeper é habilitado
    Quando inicia sua fila e worker
    Então registra cron-studio-compliance-requeue-orphaned-checks com ID estável

  Cenário: erro na varredura propaga para o mecanismo de retry
    Dado que a consulta de órfãos falha
    Quando o worker processa a ocorrência
    Então o erro é propagado para BullMQ

  Cenário: job com nome legado ainda re-enfileira checks órfãos
    Dado um scheduler legado ainda pendente
    Quando o worker processa a ocorrência antiga
    Então a varredura é executada

  Cenário: shutdown fecha o worker e a fila
    Dado que o sweeper está iniciado
    Quando a API encerra o sweeper
    Então as conexões são fechadas
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({ id: 'scheduler-job' })),
  closeQueue: vi.fn(async () => undefined),
  closeWorker: vi.fn(async () => undefined),
  processor: null as null | ((job: any) => Promise<unknown>),
  sweep: vi.fn(async () => 3),
}));

vi.mock('bullmq', () => ({
  Queue: class QueueMock {
    upsertJobScheduler = (...args: any[]) => state.upsert(...args);
    getRepeatableJobs = async () => [];
    removeRepeatableByKey = async () => true;
    getJobSchedulers = async () => [{ key: 'studio-compliance-sweeper-every-five-minutes' }];
    removeJobScheduler = async () => true;
    close = () => state.closeQueue();
  },
  Worker: class WorkerMock {
    constructor(_name: string, processor: (job: any) => Promise<unknown>) { state.processor = processor; }
    on() { return this; }
    close = () => state.closeWorker();
  },
}));
vi.mock('../lib/queue.js', () => ({ getRedisConnection: vi.fn(async () => ({})) }));
vi.mock('../services/studio/compliance-sweeper.js', () => ({ sweepOrphanComplianceAnalysis: state.sweep }));

import { startComplianceSweeper, stopComplianceSweeper } from '../workers/compliance-sweeper.worker.js';

describe('compliance sweeper BullMQ worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.processor = null;
    state.upsert.mockResolvedValue({ id: 'scheduler-job' });
    state.sweep.mockResolvedValue(3);
  });
  afterEach(async () => stopComplianceSweeper());

  it('Cenário: agenda varredura recorrente com nome cron', async () => {
    await startComplianceSweeper();

    expect(state.upsert).toHaveBeenCalledWith(
      'cron-studio-compliance-requeue-orphaned-checks-every-5m',
      { every: 300_000 },
      expect.objectContaining({ name: 'cron-studio-compliance-requeue-orphaned-checks' }),
    );
    await expect(state.processor!({ name: 'cron-studio-compliance-requeue-orphaned-checks' })).resolves.toBe(3);
  });

  it('Cenário: erro da varredura propaga para retry do BullMQ', async () => {
    state.sweep.mockRejectedValue(new Error('database unavailable'));
    await startComplianceSweeper();

    await expect(state.processor!({ name: 'cron-studio-compliance-requeue-orphaned-checks' }))
      .rejects.toThrow('database unavailable');
  });

  it('Cenário: job com nome legado ainda re-enfileira checks órfãos', async () => {
    await startComplianceSweeper();

    await expect(state.processor!({ name: 'cron:studio:requeue_orphaned_compliance' })).resolves.toBe(3);
  });

  it('Cenário: shutdown fecha worker e fila', async () => {
    await startComplianceSweeper();
    await stopComplianceSweeper();

    expect(state.closeWorker).toHaveBeenCalledOnce();
    expect(state.closeQueue).toHaveBeenCalledOnce();
  });
});
