import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAndCompletePlannerJob, enqueueMissingPlannerPosts } from '../services/planner/planner-studio.service.js';

// =============================================================================
// Testes de regressão para os bugs de idempotência e mal comportamento do
// worker de planejamento (documentados abaixo). Executar com:
//   pnpm test -- src/__tests__/planner-idempotency.test.ts
// =============================================================================

/*
BUG 1 (corrigido): O early-return do runPlannerWorkflow verificava apenas
  `artifacts.enqueued === true` e marcava o job como done sem verificar se os
  social_posts foram criados. Agora a conclusão é por contagem real
  (posts criados vs expectedPosts do artifact) e re-enfileira apenas faltantes.

BUG 7 (corrigido): O job não era marcado done prematuramente — permanece em
  `awaiting_images` até que count(socialPosts) >= expectedPosts.

BUG 5 (corrigido): enqueuePlanGeneration usa jobId de deduplicação no BullMQ.
*/

const { dbMock, plannerStoreMock, queueMock } = vi.hoisted(() => ({
  dbMock: { select: vi.fn(), query: { socialPosts: { findMany: vi.fn() } } },
  plannerStoreMock: { findByPlanId: vi.fn(), markDone: vi.fn() },
  queueMock: { add: vi.fn() },
}));

vi.mock('@fury/db', async () => {
  const { sql } = await import('drizzle-orm');
  return {
    db: dbMock,
    socialPosts: {},
    eq: (a: any) => a,
    and: (...a: any[]) => a,
    count: () => 'count',
    type: sql,
  };
});
vi.mock('../planner-store.js', () => ({ plannerStore: plannerStoreMock }));
vi.mock('../lib/queue.js', () => ({ getStudioQueue: () => queueMock }));

function mockPlannerCount(total: number) {
  dbMock.select.mockReturnValue({
    from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ total }]) }),
  });
}

describe('checkAndCompletePlannerJob — conclusão REAL (expectedPosts do artifact)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marca done quando count >= expectedPosts do artifact (não 8 fixo)', async () => {
    plannerStoreMock.findByPlanId.mockResolvedValue({
      id: 'job-1',
      status: 'awaiting_images',
      artifacts: { expectedPosts: 5 },
    });
    mockPlannerCount(5);

    await checkAndCompletePlannerJob('plan-1', 't1');

    expect(plannerStoreMock.markDone).toHaveBeenCalledWith('job-1', 'plan-1');
  });

  it('NÃO marca done quando count < expectedPosts', async () => {
    plannerStoreMock.findByPlanId.mockResolvedValue({
      id: 'job-1',
      status: 'awaiting_images',
      artifacts: { expectedPosts: 5 },
    });
    mockPlannerCount(4);

    await checkAndCompletePlannerJob('plan-1', 't1');

    expect(plannerStoreMock.markDone).not.toHaveBeenCalled();
  });

  it('usa expectedPosts do artifact (ex: 3) em vez de hardcode 8', async () => {
    plannerStoreMock.findByPlanId.mockResolvedValue({
      id: 'job-1',
      status: 'awaiting_images',
      artifacts: { expectedPosts: 3 },
    });
    mockPlannerCount(3);

    await checkAndCompletePlannerJob('plan-1', 't1');

    expect(plannerStoreMock.markDone).toHaveBeenCalled();
  });

  it('não marca done se o job não está mais em awaiting_images', async () => {
    plannerStoreMock.findByPlanId.mockResolvedValue({
      id: 'job-1',
      status: 'done',
      artifacts: { expectedPosts: 3 },
    });
    mockPlannerCount(3);

    await checkAndCompletePlannerJob('plan-1', 't1');

    expect(plannerStoreMock.markDone).not.toHaveBeenCalled();
  });
});

describe('enqueueMissingPlannerPosts — re-enfileira apenas posts faltantes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-enfileira apenas posts sem social_post criado (sem re-rodar a LLM)', async () => {
    dbMock.query.socialPosts.findMany.mockResolvedValue([
      { calendarDate: '2026-09-02', postType: 'image' },
      { calendarDate: '2026-09-03', postType: 'stories' },
    ]);
    const posts = [
      { date: '2026-09-02', postType: 'image' },
      { date: '2026-09-03', postType: 'stories' },
      { date: '2026-09-05', postType: 'image' },
    ];

    const count = await enqueueMissingPlannerPosts({ tenantId: 't1', planId: 'plan-1', posts: posts as any });

    expect(count).toBe(1);
    expect(queueMock.add).toHaveBeenCalledTimes(1);
    expect(queueMock.add.mock.calls[0][1].post.date).toBe('2026-09-05');
  });

  it('retorna 0 e não enfileira quando todos os posts já existem', async () => {
    dbMock.query.socialPosts.findMany.mockResolvedValue([
      { calendarDate: '2026-09-02', postType: 'image' },
    ]);
    const posts = [{ date: '2026-09-02', postType: 'image' }];

    const count = await enqueueMissingPlannerPosts({ tenantId: 't1', planId: 'plan-1', posts: posts as any });

    expect(count).toBe(0);
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it('re-enfileira todos quando nenhum post existe ainda', async () => {
    dbMock.query.socialPosts.findMany.mockResolvedValue([]);
    const posts = [
      { date: '2026-09-02', postType: 'image' },
      { date: '2026-09-03', postType: 'stories' },
    ];

    const count = await enqueueMissingPlannerPosts({ tenantId: 't1', planId: 'plan-1', posts: posts as any });

    expect(count).toBe(2);
    expect(queueMock.add).toHaveBeenCalledTimes(2);
  });
});