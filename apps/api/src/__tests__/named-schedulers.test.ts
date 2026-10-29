// Funcionalidade: nomes e recorrências dos schedulers BullMQ da API
/*
  Funcionalidade: padronizar jobs recorrentes com schedulers idempotentes

  Cenário: schedulers de regra, Fury, publicação e Google usam nomes descritivos
    Dado que os managers iniciam
    Quando configuram os jobs recorrentes
    Então cada um registra um nome descritivo com prefixo cron e ação/objeto
    E remove o repeatable legado antes do novo scheduler

  Cenário: duas inicializações atualizam IDs estáveis sem duplicar cron
    Dado schedulers com IDs estáveis no Redis
    Quando managers reiniciam
    Então cada manager chama upsertJobScheduler com o mesmo ID e intervalo
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const makeQueue = (name: string, legacyName: string) => ({
    name,
    getRepeatableJobs: vi.fn(async () => [{ name: legacyName, key: `${name}-legacy-key` }]),
    removeRepeatableByKey: vi.fn(async () => true),
    getJobSchedulers: vi.fn(async () => [{ key: ({
      'rule-engine': 'rule-engine-every-30-minutes',
      'fury-engine': 'fury-engine-every-30-minutes',
      'publish-due': 'publish-due-every-minute',
      'google-sync': 'google-sync-every-minute',
    } as Record<string, string>)[name] }]),
    removeJobScheduler: vi.fn(async () => true),
    upsertJobScheduler: vi.fn(async () => ({ id: `${name}-next` })),
    close: vi.fn(async () => undefined),
  });
  return {
    ruleQueue: makeQueue('rule-engine', 'process-rules'),
    furyQueue: makeQueue('fury-engine', 'fury:evaluate'),
    publishQueue: makeQueue('publish-due', 'publish-due:tick'),
    googleQueue: makeQueue('google-sync', 'google-sync:tick'),
    googleQueueConstructor: vi.fn(),
  };
});

vi.mock('bullmq', () => ({
  Queue: class Queue {
    constructor() {
      state.googleQueueConstructor();
      return state.googleQueue;
    }
  },
}));
vi.mock('../lib/queue.js', () => ({
  createRuleEngineQueue: vi.fn(async () => state.ruleQueue),
  getFuryEngineQueue: vi.fn(async () => state.furyQueue),
  getPublishDueQueue: vi.fn(async () => state.publishQueue),
  getRedisConnection: vi.fn(async () => ({})),
}));
vi.mock('../workers/rule-engine.worker.js', () => ({ startRuleEngineWorker: vi.fn(async () => ({ close: vi.fn() })) }));
vi.mock('../workers/fury-engine.worker.js', () => ({ startFuryEngineWorker: vi.fn(async () => ({ close: vi.fn() })) }));
vi.mock('../workers/publish-due.worker.js', () => ({ startPublishDueWorker: vi.fn(async () => ({ close: vi.fn() })) }));
vi.mock('../workers/google-sync.worker.js', () => ({
  startGoogleSyncWorker: vi.fn(async () => ({ close: vi.fn() })),
  stopGoogleSyncWorker: vi.fn(async () => undefined),
}));

import { startRuleEngine, stopRuleEngine } from '../lib/rule-engine-manager.js';
import { startFuryEngine, stopFuryEngine } from '../lib/fury-engine-manager.js';
import { startPublishDueManager, stopPublishDueManager } from '../lib/publish-due-manager.js';
import { startGoogleSyncManager, stopGoogleSyncManager } from '../lib/google-sync-manager.js';

describe('named recurring BullMQ schedulers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const queue of [state.ruleQueue, state.furyQueue, state.publishQueue, state.googleQueue]) {
      queue.getRepeatableJobs.mockResolvedValue([{ name: queue.name === 'rule-engine' ? 'process-rules' : queue.name === 'fury-engine' ? 'fury:evaluate' : queue.name === 'publish-due' ? 'publish-due:tick' : 'google-sync:tick', key: `${queue.name}-legacy-key` }]);
    }
  });
  afterEach(async () => {
    await stopRuleEngine();
    await stopFuryEngine();
    await stopPublishDueManager();
    await stopGoogleSyncManager();
  });

  it('Cenário: registra nomes significativos e remove os repeatables legados', async () => {
    await startRuleEngine();
    await startFuryEngine();
    await startPublishDueManager();
    await startGoogleSyncManager();

    expect(state.ruleQueue.removeRepeatableByKey).toHaveBeenCalledWith('rule-engine-legacy-key');
    expect(state.ruleQueue.removeJobScheduler).toHaveBeenCalledWith('rule-engine-every-30-minutes');
    expect(state.furyQueue.removeRepeatableByKey).toHaveBeenCalledWith('fury-engine-legacy-key');
    expect(state.publishQueue.removeRepeatableByKey).toHaveBeenCalledWith('publish-due-legacy-key');
    expect(state.googleQueue.removeRepeatableByKey).toHaveBeenCalledWith('google-sync-legacy-key');
    expect(state.googleQueue.removeJobScheduler).toHaveBeenCalledWith('google-sync-every-minute');
    expect(state.ruleQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'cron-ady-rule-engine-process-rules-every-30m', { pattern: '*/30 * * * *' },
      expect.objectContaining({ name: 'cron-ady-rule-engine-process-rules' }),
    );
    expect(state.furyQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'cron-fury-engine-evaluate-automations-every-30m', { pattern: '*/30 * * * *' },
      expect.objectContaining({ name: 'cron-fury-engine-evaluate-automations' }),
    );
    expect(state.publishQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'cron-planner-publish-scheduled-content-every-1m', { pattern: '* * * * *' },
      expect.objectContaining({ name: 'cron-planner-publish-scheduled-content' }),
    );
    expect(state.googleQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'cron-google-business-profile-sync-every-1m', { pattern: '* * * * *' },
      expect.objectContaining({ name: 'cron-google-business-profile-sync' }),
    );
  });
});
