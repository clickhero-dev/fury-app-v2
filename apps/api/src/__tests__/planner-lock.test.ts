import { describe, it, expect, vi, beforeEach } from 'vitest';

const deleteFn = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const dbMock = vi.hoisted(() => ({
  query: { workflowJobs: { findFirst: vi.fn(), findMany: vi.fn() } },
  insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve(undefined)) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(undefined)) })) })),
  delete: vi.fn(() => ({ where: deleteFn })),
}));
const queueAdd = vi.hoisted(() => vi.fn(() => Promise.resolve({ id: 'bullmq-id' })));
const assertCreditsAvailable = vi.hoisted(() => vi.fn());

vi.mock('@fury/db', async () => {
  const { sql } = await import('drizzle-orm');
  return {
    db: dbMock,
    campaignPlans: {},
    socialPosts: {},
    metaConnections: {},
    clientGoals: {},
    brandKits: {},
    workflowJobs: {},
    eq: (a: any) => a,
    and: (...a: any[]) => a,
    desc: (a: any) => a,
    gt: (a: any) => a,
    gte: (a: any) => a,
    lt: (a: any) => a,
    not: (a: any) => a,
    inArray: (a: any) => a,
    isNull: (a: any) => a,
    or: (...a: any[]) => a,
    lte: (a: any) => a,
    sql,
  };
});
vi.mock('bullmq', () => ({
  Queue: class {
    constructor() { this.add = queueAdd; }
  },
  Worker: class {},
  QueueEvents: class {},
}));
vi.mock('../lib/redis.js', () => ({
  getRedis: () => ({}),
  waitForRedisReady: async () => {},
}));
vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { assertCreditsAvailable },
}));
vi.mock('../lib/meta-api.js', () => ({
  createInstagramMedia: vi.fn(),
  getMediaContainerStatus: vi.fn(),
  publishInstagramMedia: vi.fn(),
  getUserFacebookPages: vi.fn(),
}));

import { startPlanGeneration } from '../services/planner/planner.service.js';

const MINUTE = 60 * 1000;

function activeSnapshot(updatedAtISO: string) {
  const d = new Date(updatedAtISO);
  return {
    id: 'job-1',
    tenantId: 't1',
    workflow: 'planner-generate',
    status: 'running' as const,
    lockKey: 't1',
    currentStage: 'planner',
    stages: [],
    artifacts: {},
    createdAt: d,
    updatedAt: d,
  };
}

const newJobSnapshot = {
  id: 'new-1',
  tenantId: 't1',
  workflow: 'planner-generate',
  status: 'pending' as const,
  lockKey: 't1',
  currentStage: null,
  stages: [],
  artifacts: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('startPlanGeneration — lock de job por tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCreditsAvailable.mockResolvedValue(undefined);
  });

  it('sem job ativo: cria o job e enfileira', async () => {
    (dbMock.query.workflowJobs.findFirst as any)
      .mockResolvedValueOnce(null) // findActiveByLockKey -> nenhum ativo
      .mockResolvedValueOnce(newJobSnapshot); // load do job criado

    const status = await startPlanGeneration('t1');

    expect(dbMock.insert).toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalled();
    const enqueuedPayload = (queueAdd.mock.calls[0] as any)?.[1] as { jobId: string; tenantId: string };
    expect(enqueuedPayload).toMatchObject({ tenantId: 't1', jobId: expect.any(String) });
    expect(status.id).toBe('new-1');
  });

  it('com job ativo recente (<15min): rejeita 409 pedindo para aguardar', async () => {
    (dbMock.query.workflowJobs.findFirst as any)
      .mockResolvedValueOnce(activeSnapshot(new Date(Date.now() - 2 * MINUTE).toISOString()));

    await expect(startPlanGeneration('t1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'PLANNER_JOB_IN_PROGRESS',
    });
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('com job stale (>15min): limpa dados do tenant, libera lock e regenera', async () => {
    (dbMock.query.workflowJobs.findFirst as any)
      .mockResolvedValueOnce(activeSnapshot(new Date(Date.now() - 16 * MINUTE).toISOString())) // findActiveByLockKey
      .mockResolvedValueOnce(newJobSnapshot); // load do job criado

    const status = await startPlanGeneration('t1');

    // Limpa posts + planos
    expect(deleteFn).toHaveBeenCalledTimes(2);
    // Libera o lock do job stale
    expect(dbMock.update).toHaveBeenCalled();
    // Cria novo job e enfileira
    expect(dbMock.insert).toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalled();
    expect(status.id).toBe('new-1');
  });

  it('falha no gate de créditos: não cria job nem enfileira', async () => {
    assertCreditsAvailable.mockRejectedValue(Object.assign(new Error('sem créditos'), { status: 402 }));
    await expect(startPlanGeneration('t1')).rejects.toThrow('sem créditos');
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });
});