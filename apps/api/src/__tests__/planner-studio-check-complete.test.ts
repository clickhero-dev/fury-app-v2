import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindByPlanId, mockCountPostsByPlan, mockMarkDone } = vi.hoisted(() => ({
  mockFindByPlanId: vi.fn(),
  mockCountPostsByPlan: vi.fn(),
  mockMarkDone: vi.fn(),
}));

vi.mock('../planner-store.js', () => ({
  plannerStore: { findByPlanId: mockFindByPlanId, markDone: mockMarkDone, save: vi.fn(), load: vi.fn() },
}));
vi.mock('../lib/queue.js', () => ({
  getStudioQueue: vi.fn().mockResolvedValue({ add: vi.fn() }),
}));
vi.mock('../repository/planner.repository.js', () => ({
  PlannerRepository: class {
    countPostsByPlan = mockCountPostsByPlan;
  },
}));

import { checkAndCompletePlannerJob } from '../services/planner/planner-studio.service.js';

const PLAN = 'plan-1';
const TENANT = 'tenant-1';

function awaitingJob(overrides: Record<string, unknown> = {}) {
  return { id: 'job-1', status: 'awaiting_images', artifacts: { expectedPosts: 8 }, ...overrides };
}

describe('checkAndCompletePlannerJob — conclusão com múltiplas fontes de verdade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountPostsByPlan.mockResolvedValue(8);
    mockMarkDone.mockResolvedValue(undefined);
  });

  it('completa com o artifact expectedPosts (fonte 1) quando created >= expected', async () => {
    mockFindByPlanId.mockResolvedValue(awaitingJob());

    await checkAndCompletePlannerJob(PLAN, TENANT);

    expect(mockMarkDone).toHaveBeenCalledWith('job-1', PLAN);
  });

  it('usa metadata.postsCount (fonte 2) quando não há artifact', async () => {
    mockFindByPlanId.mockResolvedValue(awaitingJob({ artifacts: {}, metadata: { postsCount: 1 } }));
    mockCountPostsByPlan.mockResolvedValue(1);

    await checkAndCompletePlannerJob(PLAN, TENANT);

    expect(mockMarkDone).toHaveBeenCalledWith('job-1', PLAN);
  });

  it('NÃO completa enquanto created < expected', async () => {
    mockFindByPlanId.mockResolvedValue(awaitingJob());
    mockCountPostsByPlan.mockResolvedValue(7);

    await checkAndCompletePlannerJob(PLAN, TENANT);

    expect(mockMarkDone).not.toHaveBeenCalled();
  });

  it('job inexistente → não quebra e não completa', async () => {
    mockFindByPlanId.mockResolvedValue(null);

    await checkAndCompletePlannerJob(PLAN, TENANT);

    expect(mockMarkDone).not.toHaveBeenCalled();
  });
});