import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Diagnóstico: o pipeline avança estágios e respeita postsCount=1? ──────────
const {
  mockStoreLoad,
  mockStoreSave,
  mockStoreMarkDone,
  mockStoreMarkFailed,
  mockEnqueueImages,
  mockBuildDates,
  mockGeneratePrompts,
} = vi.hoisted(() => ({
  mockStoreLoad: vi.fn(),
  mockStoreSave: vi.fn(),
  mockStoreMarkDone: vi.fn(),
  mockStoreMarkFailed: vi.fn(),
  mockEnqueueImages: vi.fn(),
  mockBuildDates: vi.fn(),
  mockGeneratePrompts: vi.fn(),
}));

vi.mock('../planner-store.js', () => ({
  plannerStore: {
    load: mockStoreLoad,
    save: mockStoreSave,
    markDone: mockStoreMarkDone,
    markFailed: mockStoreMarkFailed,
    renewLock: vi.fn().mockResolvedValue(undefined),
    listRecoverable: vi.fn().mockResolvedValue([]),
    findActiveByLockKey: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    findByPlanId: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { assertCreditsAvailable: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../services/planner/planner-context.service.js', () => ({
  loadPlannerContext: vi.fn().mockResolvedValue({ businessName: 'Padaria Modelo', city: 'SP', brandKit: null, goals: null }),
}));
vi.mock('../services/planner/planner-studio.service.js', () => ({
  enqueuePlannerImageJobs: mockEnqueueImages,
  enqueueMissingPlannerPosts: vi.fn().mockResolvedValue(0),
}));
vi.mock('../agents/planner.agent.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../agents/planner.agent.js')>();
  return {
    ...actual,
    buildContentDates: mockBuildDates,
    generateContentPrompts: mockGeneratePrompts,
  };
});
vi.mock('@fury/db', () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'plan-1' }]) })) })),
    query: { campaignPlans: { findFirst: vi.fn(async () => null) } },
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn(async () => ({ total: 0 })) })) })) })),
  },
  campaignPlans: {},
  socialPosts: {},
}));

import { runPlannerWorkflow } from '../planner-workflow-runner.js';

/** Monta datas determinísticas e posts mínimos (proxy de 1:1 datas→posts). */
function oneDatePerRequestedCount(_count: number) {
  return [{ date: '2026-09-10', name: 'Conteúdo #1' }];
}

function postsFromDates(dates: Array<{ date: string }>) {
  return dates.map((d, i) => ({
    date: d.date,
    title: `Post ${i + 1}`,
    caption: 'Legenda',
    cta: 'Compre agora',
    hashtags: ['#x'],
    imagePrompt: 'prompt',
    postType: 'image' as const,
    platform: 'instagram' as const,
  }));
}

describe('runPlannerWorkflow — diagnóstico do pipeline com postsCount=1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreLoad.mockResolvedValue(null); // execução nova (sem recovery)
    mockBuildDates.mockImplementation(oneDatePerRequestedCount);
    mockGeneratePrompts.mockImplementation((_ctx: unknown, dates: Array<{ date: string }>) => postsFromDates(dates));
  });

  it('propaga postsCount=1: 1 data → 1 post → exatamente 1 imagem enfileirada', async () => {
    await runPlannerWorkflow('job-1', 'tenant-1', 1);

    // O count chega a buildContentDates (datas = posts).
    expect(mockBuildDates).toHaveBeenCalledWith(1);

    // O agente recebe exatamente 1 data.
    expect(mockGeneratePrompts.mock.calls[0][1]).toHaveLength(1);

    // 1 imagem enfileirada, com o planId recém-criado.
    const enqueueArg = mockEnqueueImages.mock.calls[0][0];
    expect(enqueueArg).toMatchObject({ planId: 'plan-1', tenantId: 'tenant-1' });
    expect(enqueueArg.posts).toHaveLength(1);
  });

  it('grava awaiting_images com expectedPosts=1 (ponto de verdade do artifact)', async () => {
    await runPlannerWorkflow('job-1', 'tenant-1', 1);

    const artifactSave = mockStoreSave.mock.calls.find(([, patch]) => (patch as any)?.artifacts);
    expect(artifactSave).toBeDefined();
    expect((artifactSave![1] as any).artifacts).toMatchObject({ enqueued: true, expectedPosts: 1 });

    const awaitingSave = mockStoreSave.mock.calls.find(([, patch]) => (patch as any)?.status === 'awaiting_images');
    expect(awaitingSave).toBeDefined();
    expect((awaitingSave![1] as any).planId).toBe('plan-1');
  });

  it('NÃO chama markDone/markFailed prematuramente (conclusão pertence ao worker de imagem)', async () => {
    await runPlannerWorkflow('job-1', 'tenant-1', 1);

    expect(mockStoreMarkDone).not.toHaveBeenCalled();
    expect(mockStoreMarkFailed).not.toHaveBeenCalled();
  });
});