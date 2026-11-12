/*
Funcionalidade: recuperar vídeos pendentes por scheduler durável
Cenário: inicialização idempotente e retry apenas da recuperação
Dado duas inicializações do processo
Quando o worker registra a recorrência
Então existe um scheduler estável e a geração paga continua sem replay
Cenário: Redis volta após falha inicial
Dado uma falha ao registrar o scheduler
Quando Redis emite ready novamente
Então o registro é retomado sem reiniciar o serviço
Cenário: falha de varredura fica observável
Dado uma recuperação indisponível
Quando BullMQ executa a ocorrência
Então o erro propaga para retry e não marca uma geração como falha
Cenário: desligamento interrompe recuperação
Dado uma varredura iniciada
Quando o worker encerra
Então o callback impede novos enqueues e não registra novas recorrências
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const mocks = vi.hoisted(() => ({
  workers: [] as any[], queues: [] as any[],
  upsert: vi.fn().mockResolvedValue(undefined),
  globalConcurrency: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('bullmq', () => ({
  Worker: class {
    close = vi.fn().mockResolvedValue(undefined);
    on = vi.fn().mockReturnThis();
    constructor(public name: string, public processor: any, public options: any) { mocks.workers.push(this); }
  },
  Queue: class {
    close = vi.fn().mockResolvedValue(undefined);
    setGlobalConcurrency = mocks.globalConcurrency;
    upsertJobScheduler = mocks.upsert;
    constructor(public name: string) { mocks.queues.push(this); }
  },
}));
vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));
vi.mock('../lib/worker-metrics.js', () => ({ getWorkerMetricsOptions: (name: string) => ({ name }) }));
const redis = new EventEmitter();
import { startStudioVideoWorker, stopStudioVideoWorker } from '../workers/studio-video.worker.js';
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const service = () => ({ recoverPendingJobs: vi.fn().mockResolvedValue(1), processJob: vi.fn(), markFailed: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); mocks.workers.length = 0; mocks.queues.length = 0; });
afterEach(async () => { await stopStudioVideoWorker(); redis.removeAllListeners(); });
describe('recuperação durável de vídeo', () => {
  it('registra scheduler estável uma vez e preserva geração sem replay', async () => {
    const svc = service();
    await Promise.all([startStudioVideoWorker(svc as any), startStudioVideoWorker(svc as any)]);
    await settle();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      'cron-studio-video-recover-pending-every-30s', { every: 30_000 },
      { name: 'cron-studio-video-recover-pending', data: {}, opts: expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }) },
    );
    expect(mocks.globalConcurrency).toHaveBeenCalledWith(1);
    expect(mocks.workers.filter(w => w.name === 'studio-video-recovery')).toHaveLength(1);
    expect(mocks.workers.find(w => w.name === 'studio-video')?.options).toMatchObject({ maxStalledCount: 0, concurrency: 4 });
    expect(svc.recoverPendingJobs).not.toHaveBeenCalled();
  });
  it('rearma registro quando Redis volta após falha inicial', async () => {
    mocks.upsert.mockRejectedValueOnce(Error('redis unavailable'));
    await startStudioVideoWorker(service() as any);
    await settle();
    redis.emit('ready');
    await settle();
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.workers.filter(w => w.name === 'studio-video-recovery')).toHaveLength(1);
  });
  it('propaga falha para BullMQ sem marcar uma geração como falha', async () => {
    const svc = service(); svc.recoverPendingJobs.mockRejectedValueOnce(Error('sweep unavailable'));
    await startStudioVideoWorker(svc as any); await settle();
    const recovery = mocks.workers.find(w => w.name === 'studio-video-recovery');
    expect(recovery).toBeDefined();
    await expect(recovery.processor({ data: {} })).rejects.toThrow('sweep unavailable');
    await recovery.processor({ data: {} });
    expect(svc.recoverPendingJobs).toHaveBeenCalledTimes(2);
    expect(svc.markFailed).not.toHaveBeenCalled();
  });
  it('desliga o callback e remove listener sem apagar scheduler durável', async () => {
    const svc = service();
    await startStudioVideoWorker(svc as any); await settle();
    const recovery = mocks.workers.find(w => w.name === 'studio-video-recovery');
    expect(recovery).toBeDefined();
    await recovery.processor({ data: {} });
    const shouldContinue = svc.recoverPendingJobs.mock.calls[0][0] as unknown as () => boolean;
    expect(shouldContinue()).toBe(true);
    await stopStudioVideoWorker();
    expect(shouldContinue()).toBe(false);
    redis.emit('ready'); await settle();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(recovery.close).toHaveBeenCalledOnce();
  });
});
