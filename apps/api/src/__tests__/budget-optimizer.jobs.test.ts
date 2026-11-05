// Funcionalidade: agendamento diário e execução manual de otimização de orçamento
/*
  Funcionalidade: identificar jobs de otimização e usar Job Scheduler

  Cenário: otimização diária tem nome cron e scheduler estável
    Dado que o worker de orçamento inicia
    Quando registra a recorrência diária das 06h UTC
    Então usa cron-ady-budget-optimize-accounts e remove o repeatable antigo

  Cenário: otimização manual tem nome worker
    Dado que a fila de orçamento está iniciada
    Quando um tenant solicita otimização manual
    Então o job usa worker-ady-budget-optimize-account e preserva tentativas
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  queues: [] as any[],
  workers: [] as any[],
  addSpy: vi.fn(async (..._args: any[]) => ({ id: 'job-1' })),
  upsertSpy: vi.fn(async (..._args: any[]) => ({ id: 'scheduled-1' })),
  removeSpy: vi.fn(async () => true),
}));

vi.mock('bullmq', () => ({
  Queue: class QueueMock {
    name: string;
    constructor(name: string) {
      this.name = name;
      state.queues.push(this);
    }
    getRepeatableJobs = vi.fn(async () => [{ name: 'daily-optimization', key: 'legacy-budget-key' }]);
    removeRepeatableByKey = (...args: any[]) => state.removeSpy(...args);
    getJobSchedulers = vi.fn(async () => [{ key: 'budget-optimize-daily-at-06' }]);
    removeJobScheduler = vi.fn(async () => true);
    upsertJobScheduler = (...args: any[]) => state.upsertSpy(...args);
    add = (...args: any[]) => state.addSpy(...args);
    close = vi.fn(async () => undefined);
    getJobCounts = vi.fn(async () => ({}));
  },
  Worker: class WorkerMock {
    on = vi.fn(() => this);
    close = vi.fn(async () => undefined);
    constructor() { state.workers.push(this); }
  },
}));
vi.mock('../lib/redis.js', () => ({ getRedis: vi.fn(() => ({})) }));
vi.mock('@fury/db', () => ({ db: {}, budgetOptimizations: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
vi.mock('../lib/sse.js', () => ({ emitToTenant: vi.fn() }));
vi.mock('../services/campaigns/budget-optimizer.service.js', () => ({
  optimizeBudget: vi.fn(),
  saveSuggestions: vi.fn(),
  getBudgetConfig: vi.fn(() => ({ autoApplyEnabled: true, mode: 'auto' })),
  BudgetOptimizerError: class BudgetOptimizerError extends Error {},
}));

import { startBudgetOptimizerWorker, stopBudgetOptimizerWorker, triggerBudgetOptimization } from '../workers/budget-optimizer.worker.js';

describe('budget optimizer BullMQ jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.queues.length = 0;
    state.workers.length = 0;
    state.addSpy.mockReset().mockResolvedValue({ id: 'job-1' });
    state.upsertSpy.mockReset().mockResolvedValue({ id: 'scheduled-1' });
    state.removeSpy.mockReset().mockResolvedValue(true);
  });
  afterEach(async () => stopBudgetOptimizerWorker());

  it('Cenário: agenda a otimização diária com nome cron e scheduler estável', async () => {
    await startBudgetOptimizerWorker();

    expect(state.removeSpy).toHaveBeenCalledWith('legacy-budget-key');
    expect(state.upsertSpy).toHaveBeenCalledWith(
      'cron-ady-budget-optimize-accounts-daily-0600',
      { pattern: '0 6 * * *' },
      expect.objectContaining({ name: 'cron-ady-budget-optimize-accounts' }),
    );
  });

  it('Cenário: preserva o job manual com nome de worker e tentativas', async () => {
    await startBudgetOptimizerWorker();
    await triggerBudgetOptimization('tenant-1', 1500);

    expect(state.addSpy).toHaveBeenCalledWith(
      'worker-ady-budget-optimize-account',
      { tenantId: 'tenant-1', totalBudget: 1500, force: true },
      expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 2000 } }),
    );
  });
});
