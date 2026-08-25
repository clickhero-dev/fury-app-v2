import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const openrouterMock = vi.hoisted(() => ({ assertCreditsAvailable: vi.fn(), chat: vi.fn() }));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: {
    assertCreditsAvailable: (...a: unknown[]) => openrouterMock.assertCreditsAvailable(...a),
    chat: (...a: unknown[]) => openrouterMock.chat(...a),
  },
}));

import { snapshotToJobStatus } from '../agents/job-status-adapter.js';

const INSECURE_ERR = Object.assign(new Error('OPENROUTER_INSUFFICIENT_CREDITS'), {
  statusCode: 402,
  code: 'OPENROUTER_INSUFFICIENT_CREDITS',
});

function baseSnapshot(stageIds: string[]): any {
  return {
    id: 'job-1',
    tenantId: 't1',
    status: 'running',
    currentStage: stageIds[0],
    error: null,
    planId: null,
    stages: stageIds.map((stageId, i) => ({
      stageId,
      status: i === 0 ? 'RUNNING' : 'PENDING',
    })),
    artifacts: {},
  };
}

describe('plannerWorkflow — stage prerequisites (primeiro passo)', () => {
  beforeEach(() => {
    openrouterMock.assertCreditsAvailable.mockResolvedValue(undefined);
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('é o PRIMEIRO stage do workflow (antes de context)', async () => {
    const { plannerWorkflow } = await import('../agents/orchestrator.js');
    expect(plannerWorkflow.stages[0].id).toBe('prerequisites');
    expect(plannerWorkflow.stages[0].deps ?? []).toEqual([]);
  });

  it('execute chama assertCreditsAvailable e lança 402 sem créditos', async () => {
    openrouterMock.assertCreditsAvailable.mockRejectedValue(INSECURE_ERR);
    const { plannerWorkflow } = await import('../agents/orchestrator.js');
    const stage = plannerWorkflow.stages.find((s: any) => s.id === 'prerequisites')!;

    await expect(stage.execute({}, {})).rejects.toMatchObject({ statusCode: 402 });
    expect(openrouterMock.assertCreditsAvailable).toHaveBeenCalledTimes(1);
  });

  it('execute resolve (true) quando há créditos', async () => {
    openrouterMock.assertCreditsAvailable.mockResolvedValue(undefined);
    const { plannerWorkflow } = await import('../agents/orchestrator.js');
    const stage = plannerWorkflow.stages.find((s: any) => s.id === 'prerequisites')!;

    await expect(stage.execute({}, {})).resolves.toBe(true);
  });
});

describe('job-status-adapter — etapa prerequisites', () => {
  it('é o primeiro step exibido ao frontend e nomeado', () => {
    const job = snapshotToJobStatus(baseSnapshot(['prerequisites', 'context']));
    expect(job.agentProgress[0].name).toBe('Prerequisites Agent');
    expect(job.agentProgress[0].status).toBe('running');
  });
});
