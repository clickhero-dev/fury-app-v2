import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do service de LLM — expõe assertCreditsAvailable (gate de créditos)
const openrouterMock = vi.hoisted(() => ({ assertCreditsAvailable: vi.fn(), chat: vi.fn() }));

vi.mock('@fury/db', () => ({
  db: {},
  campaignPlans: {},
  socialPosts: {},
  metaConnections: {},
  clientGoals: {},
  brandKits: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({ type: 'eq' })),
  and: vi.fn((...a: unknown[]) => ({ type: 'and', args: a })),
  desc: vi.fn(() => ({ type: 'desc' })),
  gt: vi.fn(() => ({ type: 'gt' })),
  gte: vi.fn(() => ({ type: 'gte' })),
  lt: vi.fn(() => ({ type: 'lt' })),
  lte: vi.fn(() => ({ type: 'lte' })),
  not: vi.fn(() => ({ type: 'not' })),
  inArray: vi.fn(() => ({ type: 'inArray' })),
  isNull: vi.fn(() => ({ type: 'isNull' })),
  or: vi.fn((...a: unknown[]) => ({ type: 'or', args: a })),
  sql: vi.fn(() => ({ type: 'sql' })),
}));

vi.mock('../agents/orchestrator.js', () => ({
  generateId: vi.fn(() => 'job-123'),
  plannerWorkflow: { id: 'planner-generate', stages: [], lockKey: () => 't1' },
}));

vi.mock('../agents/job-status-adapter.js', () => ({
  snapshotToJobStatus: vi.fn((s: any) => ({ id: s.id, tenantId: s.tenantId, status: s.status })),
}));

const storeMock = vi.hoisted(() => ({
  create: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  markFailed: vi.fn(),
  markDone: vi.fn(),
  listRecoverable: vi.fn(async () => []),
  findActiveByLockKey: vi.fn(async () => null),
  runPlannerWorkflow: vi.fn(),
  recoverInterruptedPlannerWorkflows: vi.fn(async () => 0),
}));

vi.mock('../planner-workflow-runner.js', () => ({
  plannerStore: storeMock as any,
  runPlannerWorkflow: (...a: unknown[]) => storeMock.runPlannerWorkflow(...a),
  recoverInterruptedPlannerWorkflows: (...a: unknown[]) => storeMock.recoverInterruptedPlannerWorkflows(...a),
}));

const workerMock = vi.hoisted(() => ({ enqueuePlanGeneration: vi.fn(async () => {}) }));

vi.mock('../workers/planner.worker.js', () => ({
  getPlannerQueue: vi.fn(),
  enqueuePlanGeneration: (...a: unknown[]) => workerMock.enqueuePlanGeneration(...a),
  startPlannerWorker: vi.fn(async () => {}),
  stopPlannerWorker: vi.fn(async () => {}),
}));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: {
    assertCreditsAvailable: (...a: unknown[]) => openrouterMock.assertCreditsAvailable(...a),
    chat: (...a: unknown[]) => openrouterMock.chat(...a),
  },
}));

vi.mock('../middleware/errorHandler.js', () => {
  class AppError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  return { AppError };
});

vi.mock('../lib/meta-api.js', () => ({
  createInstagramMedia: vi.fn(),
  getMediaContainerStatus: vi.fn(),
  publishInstagramMedia: vi.fn(),
  getUserFacebookPages: vi.fn(),
}));

vi.mock('../utils/crypto.js', () => ({ decryptMetaToken: vi.fn() }));

import { startPlanGeneration } from '../services/planner/planner.service.js';

describe('startPlanGeneration — gate de créditos (deve PARAR antes de iniciar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openrouterMock.assertCreditsAvailable.mockResolvedValue(undefined);
    storeMock.create.mockResolvedValue({});
    workerMock.enqueuePlanGeneration.mockResolvedValue(undefined);
  });

  it('NÃO inicia o pipeline quando não há créditos: lança 402 e não enfileira job', async () => {
    openrouterMock.assertCreditsAvailable.mockRejectedValue(
      Object.assign(new Error('OPENROUTER_INSUFFICIENT_CREDITS'), { statusCode: 402, code: 'OPENROUTER_INSUFFICIENT_CREDITS' }),
    );

    await expect(startPlanGeneration('t1')).rejects.toMatchObject({
      statusCode: 402,
      code: 'OPENROUTER_INSUFFICIENT_CREDITS',
    });

    // Nenhum job criado/enfileirado → pipeline nunca inicia
    expect(storeMock.create).not.toHaveBeenCalled();
    expect(workerMock.enqueuePlanGeneration).not.toHaveBeenCalled();
  });

  it('com créditos disponíveis, inicia normalmente (cria job e enfileira)', async () => {
    openrouterMock.assertCreditsAvailable.mockResolvedValue(undefined);
    storeMock.findActiveByLockKey.mockResolvedValue(null);
    storeMock.load.mockResolvedValue({ id: 'job-123', tenantId: 't1', status: 'pending' });

    const job = await startPlanGeneration('t1');

    expect(storeMock.create).toHaveBeenCalledWith({ id: 'job-123', tenantId: 't1', workflow: 'planner-generate', lockKey: 't1' });
    expect(workerMock.enqueuePlanGeneration).toHaveBeenCalledWith('job-123', 't1');
    expect(job.status).toBe('pending');
  });
});
