// Funcionalidade: renovação de créditos e assinaturas por BullMQ
/*
  Funcionalidade: agendar renovações com jobs duráveis

  Cenário: novo scheduler executa imediatamente e repete a cada duas horas
    Dado que a API inicia o gerenciador de renovação
    Quando o BullMQ registra o scheduler
    Então ele executa uma primeira ocorrência e mantém a recorrência de duas horas

  Cenário: vários startups não duplicam o scheduler
    Dado que o gerenciador já iniciou
    Quando ele é iniciado novamente na mesma instância
    Então o BullMQ é configurado apenas uma vez com o mesmo ID estável

  Cenário: falha no serviço permite retry pelo BullMQ
    Dado que a renovação falha durante o processamento
    Quando o worker processa o job
    Então o erro é propagado para o BullMQ aplicar retry

  Cenário: job com nome legado continua sendo processado durante a drenagem
    Dado um job de renovação criado com o nome anterior
    Quando o worker processa o job
    Então a renovação existente é executada

  Cenário: shutdown fecha worker e fila
    Dado que o gerenciador iniciou
    Quando a API encerra o gerenciador
    Então as conexões BullMQ são fechadas
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  queueName: '',
  queueOptions: undefined as any,
  schedulerCalls: [] as any[],
  workerName: '',
  processor: null as null | ((job: any) => Promise<unknown>),
  workerOptions: undefined as any,
  queueClose: vi.fn(),
  workerClose: vi.fn(),
  removeLegacyScheduler: vi.fn(async () => true),
}));

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    constructor(name: string, options: any) {
      state.queueName = name;
      state.queueOptions = options;
    }
    upsertJobScheduler(...args: any[]) {
      state.schedulerCalls.push(args);
      return Promise.resolve({ id: 'scheduled-job' });
    }
    getRepeatableJobs() { return Promise.resolve([]); }
    removeRepeatableByKey() { return Promise.resolve(true); }
    getJobSchedulers() { return Promise.resolve([
      { key: 'billing-renewal-every-two-hours' },
      { key: 'cron-ady-billing-renewal-plans-and-credits-every-2h' },
    ]); }
    removeJobScheduler() { return state.removeLegacyScheduler(); }
    close() { state.queueClose(); return Promise.resolve(); }
  },
  Worker: class MockWorker {
    constructor(name: string, processor: (job: any) => Promise<unknown>, options: any) {
      state.workerName = name;
      state.processor = processor;
      state.workerOptions = options;
    }
    on() { return this; }
    close() { state.workerClose(); return Promise.resolve(); }
  },
  MetricsTime: { ONE_WEEK: 7 * 24 * 60 * 60 * 1000 },
}));

vi.mock('../lib/queue.js', () => ({
  getRedisConnection: vi.fn(async () => ({ status: 'ready' })),
}));

import {
  startSubscriptionRenewalManager,
  stopSubscriptionRenewalManager,
} from '../lib/subscription-renewal-manager.js';

function makeService() {
  return { renewAllDue: vi.fn().mockResolvedValue({ renewed: 2, skipped: 0 }) } as any;
}

function resetState() {
  state.queueName = '';
  state.queueOptions = undefined;
  state.schedulerCalls = [];
  state.workerName = '';
  state.processor = null;
  state.workerOptions = undefined;
  state.queueClose.mockReset();
  state.workerClose.mockReset();
  state.removeLegacyScheduler.mockReset().mockResolvedValue(true);
}

describe('subscription-renewal-manager', () => {
  beforeEach(resetState);
  afterEach(async () => stopSubscriptionRenewalManager());

  it('Cenário: agenda um bootstrap imediato e recorrência de duas horas', async () => {
    const service = makeService();
    await startSubscriptionRenewalManager(service);

    expect(state.queueName).toBe('billing-renewal');
    expect(state.workerName).toBe('billing-renewal');
    expect(state.removeLegacyScheduler).toHaveBeenCalledTimes(2);
    expect(state.schedulerCalls).toEqual([[
      'cron-ady-billing-renewal-plans-every-2h',
      { every: 7_200_000, immediately: true },
      {
        name: 'cron-ady-billing-renewal-plans',
        data: {},
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
      },
    ]]);
    await state.processor!({ name: 'cron-ady-billing-renewal-plans' });
    expect(service.renewAllDue).toHaveBeenCalledOnce();
  });

  it('Cenário: chamadas repetidas mantêm um único scheduler', async () => {
    await startSubscriptionRenewalManager(makeService());
    await startSubscriptionRenewalManager(makeService());

    expect(state.schedulerCalls).toHaveLength(1);
  });

  it('Cenário: erro no serviço propaga para o retry do BullMQ', async () => {
    const service = { renewAllDue: vi.fn().mockRejectedValue(new Error('database unavailable')) } as any;
    await startSubscriptionRenewalManager(service);

    await expect(state.processor!({ name: 'cron-ady-billing-renewal-plans' }))
      .rejects.toThrow('database unavailable');
  });

  it('Cenário: job com nome legado continua sendo processado durante a drenagem', async () => {
    const service = makeService();
    await startSubscriptionRenewalManager(service);

    await state.processor!({ name: 'cron:billing:renew_plan_and_credits' });

    expect(service.renewAllDue).toHaveBeenCalledOnce();
  });

  it('Cenário: shutdown fecha worker e fila', async () => {
    await startSubscriptionRenewalManager(makeService());
    await stopSubscriptionRenewalManager();

    expect(state.workerClose).toHaveBeenCalledOnce();
    expect(state.queueClose).toHaveBeenCalledOnce();
  });
});
