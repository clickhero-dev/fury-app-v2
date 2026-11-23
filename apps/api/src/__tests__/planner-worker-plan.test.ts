import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  processor: null as null | ((job: { data: Record<string, unknown> }) => Promise<void>),
  skip: vi.fn(),
  markFailed: vi.fn(async () => {}),
  run: vi.fn(async () => {}),
}));

vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_q: string, fn: typeof h.processor) { h.processor = fn; }
    on() { return this; }
  },
  Queue: class {},
}));
vi.mock('../lib/redis.js', () => ({ getRedis: () => ({}) }));
vi.mock('../lib/worker-metrics.js', () => ({ getWorkerMetricsOptions: () => ({}) }));
vi.mock('../lib/plan-skip.js', () => ({ planSkipsTenant: h.skip }));
vi.mock('../planner-store.js', () => ({ plannerStore: { markFailed: h.markFailed } }));
vi.mock('../planner-workflow-runner.js', () => ({ runPlannerWorkflow: h.run }));

import { startPlannerWorker } from '../workers/planner.worker.js';

describe('planner worker — plano do cliente', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await startPlannerWorker();
  });

  it('plano sem planejador: marca o job como falho e não gera', async () => {
    h.skip.mockResolvedValue(true);
    await h.processor!({ data: { jobId: 'j1', tenantId: 't1' } });
    expect(h.markFailed).toHaveBeenCalledWith('j1', 'plan-blocked', expect.any(String));
    expect(h.run).not.toHaveBeenCalled();
  });

  it('plano com planejador: gera normalmente', async () => {
    h.skip.mockResolvedValue(false);
    await h.processor!({ data: { jobId: 'j2', tenantId: 't1', postsCount: 4 } });
    expect(h.run).toHaveBeenCalledWith('j2', 't1', 4);
    expect(h.markFailed).not.toHaveBeenCalled();
  });
});
